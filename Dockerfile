# syntax=docker/dockerfile:1

# Multi-stage build for the statssa-rafiki monorepo (pnpm workspace).
#
#   runtime — node:24 image with the whole installed + built workspace. Used by the
#             API (node dist/main.js), the four front-ends (vp preview) and the
#             one-shot migrate / rag-init jobs.
#   auth    — oven/bun image with only what the auth issuer needs. Bun runs the
#             TypeScript sources directly, so apps/auth is never compiled.

# --- base: node + corepack pnpm ---------------------------------------------

FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- deps: manifests only, so installs stay cached while sources change -----

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/auth/package.json apps/auth/
COPY apps/control-centre/package.json apps/control-centre/
COPY apps/media-portal/package.json apps/media-portal/
COPY apps/public-portal/package.json apps/public-portal/
COPY apps/research-portal/package.json apps/research-portal/
COPY apps/storybook/package.json apps/storybook/
COPY apps/website/package.json apps/website/
COPY packages/agent-contract/package.json packages/agent-contract/
COPY packages/ai-chat/package.json packages/ai-chat/
COPY packages/auth-contract/package.json packages/auth-contract/
COPY packages/media-contract/package.json packages/media-contract/
COPY packages/media-ui/package.json packages/media-ui/
COPY packages/popia-contract/package.json packages/popia-contract/
COPY packages/popia-ui/package.json packages/popia-ui/
COPY packages/ui/package.json packages/ui/
COPY packages/utils/package.json packages/utils/
# --ignore-scripts skips the workspace "prepare" hooks (root `vp config` needs
# git; the contract packages' `vp pack` would fail without sources here). The
# build stage packs every package it needs explicitly, and no installed
# dependency ships a build script that is required at runtime (esbuild, sharp
# and onnxruntime-node ship prebuilt binaries via optionalDependencies).
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- build: copy sources, build contracts, the API and the four front-ends --

FROM deps AS build
COPY . .
# The "...", filters include each app's workspace dependencies, so the shared
# contracts (vp pack) and UI packages are built first, in topological order.
# apps/auth needs no build (Bun runs its sources directly); research-portal and
# storybook are not part of the composed stack.
RUN pnpm --filter "api..." --filter "website..." --filter "public-portal..." \
        --filter "media-portal..." --filter "control-centre..." run build

# --- runtime: node services (api, front-ends, migrate, rag-init) ------------

FROM base AS runtime
ENV NODE_ENV=development
COPY --from=build /app /app

# --- auth: Bun runtime with just the auth issuer's slice of the workspace ---

FROM oven/bun:1-slim AS auth
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/auth ./apps/auth
# OpenAuth persists accounts and signing keys to apps/auth/.openauth-persist.json
# (path is hard-coded relative to auth/index.ts). Symlink it into ./data so the
# compose volume can keep that state across container recreation.
RUN mkdir -p apps/auth/data \
 && ln -s data/.openauth-persist.json apps/auth/.openauth-persist.json
WORKDIR /app/apps/auth
EXPOSE 3000
CMD ["bun", "run", "auth/index.ts"]
