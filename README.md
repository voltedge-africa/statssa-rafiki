# statssa-rafiki

A Vite+ monorepo for the STATSSA Rafiki auth stack.

| App                   | What it is                                                                                                                                                                                                                                                          | Stack                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `apps/auth`           | OpenAuth issuer — a standalone auth server with email/password login and a Postgres-backed user store. Issues access tokens carrying a `role`.                                                                                                                      | Bun, Hono, OpenAuth, Drizzle ORM, Postgres |
| `apps/api`            | NestJS API. Grounded chat agent over a local Stats SA corpus, plus JWKS token verification, role guards, the POPIA request desk, media fact-check drafting, content-analysis briefs, the knowledge-gap log and durable AI telemetry.                                | NestJS (Express), pgvector, Vitest, Oxc    |
| `apps/website`        | The public front-end. Signs users in through the issuer, serves the POPIA request desk at `/popia` (footer links only), and sends Staff/Admin to the control centre after sign-in.                                                                                  | Vite (React SPA), Node middleware          |
| `apps/public-portal`  | The public chat portal on port 3003. Answers statistics questions from the API's RAG corpus. Linked from the website hero.                                                                                                                                          | Vite (React SPA)                           |
| `apps/media-portal`   | The media room on port 3004. Signed-in users file fact-check requests, watch them move through human review and read the approved, referenced response.                                                                                                             | Vite (React SPA), Node middleware          |
| `apps/control-centre` | The Staff/Admin workspace on port 3006. Signs in through the issuer, works the POPIA case queue, reviews media fact-check drafts, analyses official content into cited comms briefs, reads the knowledge-gap log and (Admins only) queries AI governance telemetry. | Vite (React SPA), Node middleware          |

Users register with one of three roles — **Press**, **Staff**, **Admin**. After signing in, **Press** lands on `/press`; **Staff** and **Admin** are redirected to the control centre (port 3006).

The token shape and roles live once in [`packages/auth-contract`](packages/auth-contract) and are shared by the issuer, website and API. The POPIA vocabulary (request types, statuses, lifecycle and view shapes) lives once in [`packages/popia-contract`](packages/popia-contract) and is shared by the API, website and database enums. The media vocabulary (fact-check statuses, lifecycle, draft and view shapes) lives once in [`packages/media-contract`](packages/media-contract) and is shared by the API, media portal, control centre and database enums. The agent vocabulary (chat events, UI blocks and AI telemetry spans) lives once in [`packages/agent-contract`](packages/agent-contract) and is shared by the API, the chat surfaces and the control centre's AI governance view. The content-analysis vocabulary (brief dimensions, schemas and view shapes) lives in [`packages/brief-contract`](packages/brief-contract), and the knowledge-gap vocabulary (ungrounded-query surfaces, category and summary shapes) in [`packages/gaps-contract`](packages/gaps-contract); both are shared by the API and the control centre.

---

## Prerequisites

- **Vite+ (`vp`)** — the toolchain used to install, run, and check everything.
  ```bash
  curl -fsSL https://vite.plus | bash
  ```
- **Docker + Docker Compose** — runs Postgres and Mailpit.
- **Bun** — runs the auth issuer.
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Node.js >= 22.12.0** (declared in `engines`). `vp` can manage the runtime for you.

Verify:

```bash
vp --version
docker compose version
bun --version
```

---

## First-time setup

Run these once after cloning (and after pulling changes that touch dependencies or migrations):

```bash
# 1. Install all workspace dependencies
vp install

# 2. Start Postgres and Mailpit (apps/auth/docker-compose.yml, bound to 127.0.0.1)
vp run db:up

# 3. Apply the Drizzle migrations (creates the `users` table, `role` enum and the POPIA and media tables)
vp run db:migrate

# 4. (Optional, for the API's grounded answers) cache the embedding model and index the corpus
vp run rag:model
vp run rag:ingest
```

`vp install` also runs `vp config` (git hooks) via the `prepare` script.

### Environment variables (optional)

The defaults work for local development. Copy the examples only if you need to override something:

```bash
cp apps/auth/.env.example apps/auth/.env
cp apps/api/.env.example apps/api/.env
cp apps/website/.env.example apps/website/.env
cp apps/public-portal/.env.example apps/public-portal/.env
cp apps/media-portal/.env.example apps/media-portal/.env
cp apps/control-centre/.env.example apps/control-centre/.env
```

| Variable                  | App                                                                              | Default                                               | Purpose                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | `apps/auth`, `apps/api`                                                          | `postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth` | Postgres connection string. The API reads the same database for POPIA requests.                                                     |
| `AUTH_PORT`               | `apps/auth`, `apps/api`, `apps/website`, `apps/control-centre`                   | `3000`                                                | Port the issuer listens on. The API and both apps derive the issuer URL from it.                                                    |
| `AUTH_ALLOWED_ORIGINS`    | `apps/auth`                                                                      | –                                                     | Extra redirect-URI origins (comma-separated `scheme://host`). Same-host clients are allowed automatically.                          |
| `VITE_AUTH_ISSUER`        | `apps/website`, `apps/control-centre`                                            | derived from the browser hostname                     | Override the issuer URL (only needed behind an HTTPS proxy).                                                                        |
| `API_PORT`                | `apps/api`                                                                       | `3001`                                                | Port the API listens on.                                                                                                            |
| `AUTH_ISSUER`             | `apps/api`                                                                       | derived from the request host                         | Override the issuer URL. Required in production.                                                                                    |
| `API_ALLOWED_ORIGINS`     | `apps/api`                                                                       | reflect any origin in dev, none in production         | Browser origins allowed by CORS (comma-separated `scheme://host`).                                                                  |
| `RAG_DATABASE_URL`        | `apps/api`                                                                       | `postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_rag`  | Postgres database holding the RAG index (needs the `pgvector` extension).                                                           |
| `VITE_API_BASE`           | `apps/public-portal`, `apps/website`, `apps/media-portal`, `apps/control-centre` | `http://localhost:3001`                               | API base the portal calls (website, media portal and control centre proxy `/api/popia/*` and `/api/media/*` through their servers). |
| `VITE_CONTROL_CENTRE_URL` | `apps/website`, `apps/media-portal`                                              | derived from the browser hostname, port 3006          | Where Staff/Admin are sent after signing in, and the review desk linked from the media room header.                                 |
| `VITE_WEBSITE_URL`        | `apps/control-centre`, `apps/media-portal`                                       | derived from the browser hostname, port 3002          | Public site linked from the control centre and media room.                                                                          |
| `VITE_PUBLIC_PORTAL_URL`  | `apps/media-portal`                                                              | derived from the browser hostname, port 3003          | Public chat portal linked from the media room footer.                                                                               |

---

## Run

Bring the whole system up from the repo root:

```bash
vp install          # once, and after any pull that changes dependencies
vp run db:up        # Postgres + Mailpit
vp run db:migrate   # users, POPIA and media tables
vp run dev:all      # auth 3000, api 3001, web 3002, public 3003, media 3004, control 3006
```

Or run the six processes separately, in six terminals, from the repo root:

```bash
# terminal 1 — auth issuer on http://localhost:3000
vp run dev:auth

# terminal 2 — website (and POPIA desk) on http://localhost:3002
vp run dev

# terminal 3 — API on http://localhost:3001
vp run dev:api

# terminal 4 — public chat portal on http://localhost:3003
vp run dev:public

# terminal 5 — media room on http://localhost:3004
vp run dev:media

# terminal 6 — control centre on http://localhost:3006
vp run dev:control
```

`vp run dev:all` prebuilds the shared packages and runs all six together with
[`concurrently`](https://github.com/open-cli-tools/concurrently), with labelled, interleaved
output. **Ctrl+C stops all six**; don't kill the individual processes, as their children (Bun,
Nest) can outlive them.

Open <http://localhost:3002> and click **Sign in or register**. POPIA requests live at
<http://localhost:3002/popia> and are linked from the footer. Staff and Admin sign in to the
control centre at <http://localhost:3006> to work the case queue and the media desk. The media
room lives at <http://localhost:3004>.

> Verification codes arrive in Mailpit at <http://localhost:8025> (started by `vp run db:up`). If
> SMTP is unconfigured, they are printed to the auth server's terminal instead.

---

## Docker

The whole stack can run in Docker instead of six terminals. `docker-compose.yml` at the repo root
starts Postgres (pgvector), Mailpit, the auth issuer (Bun), the NestJS API, all four front-ends
(`vp preview` with their OAuth middleware), applies the Drizzle migrations and seeds the RAG
index — in dependency order, with healthchecks. If OpenCode chat is needed, export
`OPENCODE_API_KEY` before starting.

```bash
docker compose up -d --build   # or: vp run docker:up
docker compose ps              # wait for everything to report healthy
docker compose logs -f api     # or: vp run docker:logs
docker compose down            # or: vp run docker:down (keeps data)
docker compose down -v         # or: vp run docker:reset (wipes DB, RAG index, auth keys)
docker compose run --rm rag-init   # or: vp run docker:rag (re-index the corpus)
```

Once everything is healthy, use the same URLs as native development: website
<http://localhost:3002>, public portal <http://localhost:3003>, media room
<http://localhost:3004>, control centre <http://localhost:3006>, API <http://localhost:3001>,
issuer <http://localhost:3000> and Mailpit <http://localhost:8025>.

How it fits together:

- **Images** — a single multi-stage [`Dockerfile`](Dockerfile). The `runtime` target (node:24)
  carries the installed and built workspace and serves the API (`node dist/main.js`), the
  front-ends (`vp preview`) and the one-shot jobs. The `auth` target (oven/bun) carries only the
  auth issuer's slice and runs its TypeScript sources directly. Dependency manifests are copied
  separately so `pnpm install` stays cached while sources change.
- **Host networking** — every service uses `network_mode: host`. The OAuth middleware in the
  front-ends derives the issuer URL from the hostname the browser used and performs server-side
  token exchanges against it, so the issuer must resolve the same way inside and outside the
  containers. Host networking keeps every URL identical to native development. The trade-off: the
  stack occupies ports 3000–3006, 5432, 1025 and 8025 on the host, so stop the native dev stack
  (`vp run dev:all`, `vp run db:up`) before `docker compose up`. Postgres and Mailpit listen on
  `127.0.0.1` only — the DB and dev mail stay off the LAN/tailnet, same as native dev.
- **One-shot jobs** — `migrate` (drizzle-kit) runs before the issuer starts; `rag-init` caches
  the embedding model and indexes `apps/api/corpus` into `rafiki_rag`. Both are idempotent, and
  the API does not block on `rag-init`: if the model download fails (offline first run), the API
  still boots and degrades to information-gap answers until `vp run docker:rag` succeeds.
- **State** — named volumes keep Postgres data, the auth issuer's accounts/signing keys
  (`.openauth-persist.json`) and the cached embedding model across restarts.

The middleware proxies now forward `X-Forwarded-Host`, which lets the API derive the issuer the
same way it does for direct browser calls — required for the token's `iss` claim to verify when
the proxy target host differs from the browser's host (containers, any reverse proxy).

---

### Port allocation

Ports are fixed (`strictPort`) and allocated from 3000. A taken port fails that server instead of
picking the next free one.

| Service         | Port |
| --------------- | ---- |
| Auth issuer     | 3000 |
| API             | 3001 |
| Website         | 3002 |
| Public portal   | 3003 |
| Media portal    | 3004 |
| Research portal | 3005 |
| Control centre  | 3006 |
| Storybook       | 3007 |

Postgres (5432) and Mailpit (1025 SMTP, 8025 UI) stay on their standard ports and bind to
`127.0.0.1` only.

The research portal (3005) and Storybook (3007) are not part of `dev:all`; start them on demand:

```bash
vp -C apps/research-portal dev
vp -C apps/storybook dev
```

### Accessing over Tailscale

All dev servers listen on all interfaces, so from another machine on your tailnet open:

```
http://<hostname>:3002     # website (and /popia)
http://<hostname>:3003     # public portal
http://<hostname>:3004     # media room
http://<hostname>:3001     # API
http://<hostname>:3006     # control centre (and /media)
```

e.g. `http://armomarchy.taild8f6b9.ts.net:3002`. The website, the control centre and the API derive the issuer URL from the hostname you used (`http://<hostname>:3000`), so no config is needed. The database stays bound to `127.0.0.1` and is **not** exposed to the tailnet.

> The public portal calls the API from the browser, so when using the chat from another tailnet machine set `VITE_API_BASE=http://<hostname>:3001` in `apps/public-portal/.env` (its default, `http://localhost:3001`, would point at the browser's own machine).

---

## Database

The dev database is defined in [`apps/auth/docker-compose.yml`](apps/auth/docker-compose.yml) and stored in the `auth_rafiki-auth-postgres` volume.

| Command              | Does                                                        |
| -------------------- | ----------------------------------------------------------- |
| `vp run db:up`       | Start Postgres and Mailpit (`docker compose up -d`).        |
| `vp run db:down`     | Stop them (keeps data).                                     |
| `vp run db:migrate`  | Apply committed migrations.                                 |
| `vp run db:generate` | Generate a migration after editing the schema.              |
| `vp run db:push`     | Push the schema directly (dev shortcut; no migration file). |

The schema lives in [`apps/auth/auth/db/schema.ts`](apps/auth/auth/db/schema.ts); generated SQL is committed under `apps/auth/auth/db/migrations/`.

After changing the schema:

```bash
vp run db:generate
vp run db:migrate
```

To wipe the database completely (including the volume):

```bash
cd apps/auth && docker compose down -v
```

Raw SQL access:

```bash
docker exec -it rafiki-auth-postgres psql -U rafiki -d rafiki_auth
```

---

## Corpus (RAG)

The API answers statistics questions from a local corpus using hybrid keyword and vector search
backed by Postgres (`rafiki_rag` on the same server as auth, with the `pgvector` extension).

```bash
vp run rag:model   # one-time: download the local embedding model (only online step)
vp run rag:ingest  # embed and index apps/api/corpus into Postgres
```

- Source documents live in [`apps/api/corpus`](apps/api/corpus) (`.txt`, `.md`, `.json`,
  `.jsonl`); a sample CPI extract ships under `corpus/sample`.
- Re-run `vp run rag:ingest` after changing the corpus. Files are keyed by content hash, so
  unchanged documents are skipped and changed ones are replaced atomically.
- `pgvector` is enabled on first ingest. The auth database (`rafiki_auth`) and the RAG database
  (`rafiki_rag`) share the one Postgres container.

Raw SQL access to the index:

```bash
docker exec -it rafiki-auth-postgres psql -U rafiki -d rafiki_rag
```

---

## Roles and redirects

- Registration asks for a role (**Press**, **Staff**, **Admin**); it is stored per email in Postgres.
- On sign-in the issuer reads the role by email and puts it in the access token's subject.
- The website's `/callback` redirects **Press** to `/press`, and **Staff**/**Admin** to the control
  centre (port 3006). Visiting a role page you don't belong to shows **Not authorized**; unknown
  paths return a real **404**.
- The API treats the token's role as authoritative: `GET /me` returns the caller's subject, and routes marked `@Roles(...)` reject the wrong role with **403**.

### Resetting dev auth state

- **Accounts / signing keys** live in `apps/auth/.openauth-persist.json` (OpenAuth `MemoryStorage`, dev only). Delete the file while the auth server is stopped to force re-registration.
- **Users / roles** live in Postgres. Clear them with:
  ```bash
  docker exec rafiki-auth-postgres psql -U rafiki -d rafiki_auth -c 'truncate users;'
  ```

---

## API

`apps/api` is a NestJS (Express) service that trusts only the auth issuer. Requests carry an
`Authorization: Bearer <access token>` header; the token is verified against the issuer's JWKS and
its subject (`{ id, role }`) is validated against the shared contract.

| Route                                        | Access        | Returns                                                                                  |
| -------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `GET /health`                                | public        | `{ status, uptime }`                                                                     |
| `GET /me`                                    | any role      | the caller's subject                                                                     |
| `GET /admin/ping`                            | Admin         | role-guard example                                                                       |
| `POST /popia/requests`                       | public        | submit a request; a token links it to account                                            |
| `POST /popia/requests/track`                 | public        | track by reference + email                                                               |
| `GET /popia/requests/mine`                   | any role      | requests linked to the caller                                                            |
| `GET /popia/requests`                        | Staff, Admin  | case queue (`status`, `type`, `assigned`, `q`)                                           |
| `GET /popia/requests/:reference`             | Staff, Admin  | case file with the full timeline                                                         |
| `PATCH /popia/requests/:reference`           | Staff, Admin  | status, assignment or resolution                                                         |
| `POST /popia/requests/:reference/notes`      | Staff, Admin  | internal or requester-visible note                                                       |
| `POST /media/requests`                       | any signed-in | submit a media fact-check request (starts AI drafting)                                   |
| `GET /media/requests/mine`                   | any signed-in | the caller's media requests                                                              |
| `GET /media/requests/mine/:reference`        | owner         | request tracking plus the approved response                                              |
| `POST /media/requests/:reference/withdraw`   | owner         | withdraw an open request                                                                 |
| `GET /media/requests`                        | Staff, Admin  | media queue (`status`, `assigned`, `q`)                                                  |
| `GET /media/requests/:reference`             | Staff, Admin  | media case file including the AI draft                                                   |
| `PATCH /media/requests/:reference`           | Staff, Admin  | status, assignment or a lifecycle note                                                   |
| `POST /media/requests/:reference/approve`    | Staff, Admin  | approve and release the reviewed response                                                |
| `POST /media/requests/:reference/reject`     | Staff, Admin  | decline with a requester-visible reason                                                  |
| `POST /media/requests/:reference/regenerate` | Staff, Admin  | rebuild the grounded draft                                                               |
| `POST /media/requests/:reference/notes`      | Staff, Admin  | internal or requester-visible note                                                       |
| `GET /analysis/documents`                    | Staff, Admin  | indexed official content the analysis builder can scope                                  |
| `POST /analysis/briefs`                      | Staff, Admin  | generate and persist a cited analysis brief from selected documents                      |
| `GET /analysis/briefs`                       | Staff, Admin  | saved briefs (`q`, `limit`, `offset`)                                                    |
| `GET /analysis/briefs/:id`                   | Staff, Admin  | one saved brief with its references and verification                                     |
| `GET /gaps/summary`                          | Staff, Admin  | knowledge-gap rollup (`days`)                                                            |
| `GET /gaps/categories`                       | Staff, Admin  | categorised ungrounded queries (`q`, `limit`, `offset`)                                  |
| `GET /gaps/categories/:id/queries`           | Staff, Admin  | the individual queries in one category                                                   |
| `GET /api/status`                            | public        | provider/model availability                                                              |
| `POST /api/chat`                             | public        | SSE chat stream (optional auth tags the portal role)                                     |
| `POST /api/reset`                            | public        | forget a chat session                                                                    |
| `GET /api/telemetry`                         | Admin         | live in-memory spans (snapshot)                                                          |
| `GET /api/telemetry/stream`                  | Admin         | live in-memory spans (SSE)                                                               |
| `POST /api/telemetry/clear`                  | Admin         | clear the in-memory span buffer                                                          |
| `GET /admin/ai/usage`                        | Admin         | AI model governance rollup (`from`, `to`, `model`, `feature`, `role`, `tool`, `session`) |
| `GET /admin/ai/model-calls`                  | Admin         | paginated model calls (`limit`, `offset` + filters)                                      |
| `GET /admin/ai/tool-calls`                   | Admin         | paginated tool calls (`limit`, `offset` + filters)                                       |
| `GET /admin/ai/sessions/:sessionId`          | Admin         | every persisted span for one session                                                     |

- The issuer URL is derived from the request host and `AUTH_PORT`, so it works locally and over a
  tailnet. Set `AUTH_ISSUER` to override; it is required in production.
- CORS reflects any origin in development and allows only `API_ALLOWED_ORIGINS` in production, so
  server-to-server calls (like the website's middleware) always work.
- Guards: `@Public()` opts a route out of auth, `@OptionalAuth()` treats a missing token as
  anonymous but still verifies one that is present, `@Roles("Admin")` restricts a route, and
  `@CurrentUser()` injects the verified subject.

### AI telemetry and model governance

Every AI call is instrumented through pi's `TelemetryContext` (`apps/api/src/agent/telemetry.service.ts`).
Settled spans are flattened and persisted by `telemetry.persistence.ts` into the `ai_spans` table in
the auth database, alongside the POPIA and media tables. Admins query the `ai_model_usage` and
`ai_tool_usage` views (or the `/admin/ai/*` endpoints) to see which models and tools are being used,
token and cost totals, latency and error rates.

Recording is deliberately non-verbose and POPIA-conscious: spans hold model/provider/operation
metadata, tool names, token counts, cost, latency and status, but never prompt, completion or
tool-output content, and never the user's identity. Each row is tagged with the originating feature
(`chat`, `media_draft`) and portal role (`Press`, `Staff`, `Admin`, `anonymous`) only. The live
`/api/telemetry` buffer is Admin-only because it spans all sessions and `clear` mutates shared state;
retention/pruning is intentionally not implemented yet (the `created_at` column is indexed for it).

---

## POPIA request desk

The public desk lives in `apps/website` under `/popia` (the only links to it are in the site
footer):

- **Submit** (`/popia`) — access, correction, deletion or objection requests. No account is
  required; signing in first links the request to the account. The API issues a
  `POPIA-YYYY-XXXXXX` reference and a 30-day response deadline.
- **Track** (`/popia/track`) — the reference plus the email used to submit unlocks the request and
  its requester-visible timeline.
- **My requests** (`/popia/my`) — signed-in requesters see everything linked to their account.

The **case queue** lives in `apps/control-centre` (port 3006), the Staff/Admin workspace. Case
workers move requests through the lifecycle (submitted → acknowledged → in review ⇄ awaiting
information → completed/rejected/withdrawn), assign cases, record a resolution and add internal or
requester-visible notes. Every change appends to the audit trail.

**AI Governance** is an Admin-only area of the control centre (`/ai` → Telemetry). It queries the
persisted `ai_spans` telemetry in `rafiki_auth` and shows model/tool usage, token and cost totals,
latency, error rates, per-day breakdowns and a per-session span trace, filterable by date, model,
tool, surface and portal role. The view uses the control centre's shared `@voltedge/ui` components
and reads through `/api/admin/ai/*`, which the Vite middleware proxies with the session token.

Neither app exposes tokens to the browser: their Vite middleware runs the OpenAuth flow with
httpOnly cookies and proxies `/api/popia/*` to `apps/api` with the session token attached. POPIA
data lives in `rafiki_auth` (`popia_requests` + `popia_request_events`); the vocabulary, status
transitions and validation schemas are defined in
[`packages/popia-contract`](packages/popia-contract), and the shared API client and request
components in [`packages/popia-ui`](packages/popia-ui).

---

## Media room

The media room lives in `apps/media-portal` (port 3004). Any signed-in user — media
stakeholders register as **Press** — can file a fact-check request at `/request`, track its
progress at `/requests`, and read the approved response with its references. Media responses are
**never issued automatically**.

How a request is handled:

- **Submit** — the API stores the request (`submitted`), returns a `MEDIA-YYYY-XXXXXX`
  reference and starts analysis in the background (`analysing`).
- **Grounded draft** — retrieval runs first over the RAG corpus. No relevant passage means an
  immediate `information_gap` with a reason and **no model call**; otherwise the model sees only
  the retrieved passages and must cite them with `[source#chunk]` ids. The draft and its
  references are stored against the request (`awaiting_review`).
- **Human review** — the media desk in the control centre (`/media`) shows the claim, the AI
  draft (clearly badged as AI-generated and unreviewed) and an editable response. A Staff/Admin
  user edits, checks the references, then approves or declines with a reason. Reviewers can also
  regenerate the draft after the corpus changes.
- **Release** — only the approved wording is shown to the requester, labelled as reviewed by
  Stats SA, with the references cited in it. The AI draft itself is never released; it stays in
  the staff case file for audit.

Requester views never include the draft, assignment or internal notes. Media data lives in
`rafiki_auth` (`media_requests` + `media_request_events`); the vocabulary, status transitions,
draft shapes and validation schemas are defined in
[`packages/media-contract`](packages/media-contract), and the shared API client, draft card and
reference list in [`packages/media-ui`](packages/media-ui).

---

## Content analysis and knowledge gaps

Two adjacent surfaces in the control centre (port 3006, Staff/Admin) turn the same approved
corpus and published-table store into communications intelligence.

**Analysis briefs** (`/analysis`) — select one or more indexed official documents (statistical
releases, media releases, presentations, research publications), optionally set a focus, and
generate a persisted brief covering key findings, key statistics, trends, insights and context.
Retrieval runs first, one scoped probe per review dimension, so every dimension has evidence;
the confidence floor escalates weak retrieval to a gap instead of drafting from it. The model
sees only the retrieved passages and read-only fact-store lookups, and must cite each claim with
`[source#chunk]` or `[factstore:<table>]`. Every number in the brief is checked against the
retrieved passages and tool rows before the brief is saved, and the verification result is shown
on the brief. Citations open the indexed document beside the article. Briefs live in
`rafiki_auth.analysis_briefs`; the vocabulary and schemas are in
[`packages/brief-contract`](packages/brief-contract).

**Knowledge gaps** (`/gaps`) — every query the approved sources could not answer is logged:
chat refusals from the public portal and `information_gap` media fact-check requests. Each query
is embedded with the local retrieval model and clustered into a topic category (for example, a
run of outlets asking about the same uncovered statistic lands in one category); Staff/Admin can
read the rollup, filter by window and drill into the underlying queries. Categories carry a
deterministic label immediately, upgraded by a best-effort model label. No user identity is
stored for chat gaps (role and origin host only); media rows point at their request. Gap data
lives in `rafiki_auth.gap_queries` + `gap_categories` (pgvector centroid); the vocabulary and
schemas are in [`packages/gaps-contract`](packages/gaps-contract).

---

## Quality checks

```bash
vp check         # format + lint + type check
vp run -r test   # run tests across the workspace
vp run -r build  # build the workspace
vp run ready     # fmt + lint + test + build (the full pre-push gate)
```

---

## Project layout

```
apps/
  auth/
    auth/
      index.ts        # issuer: providers, success -> role in subject
      register-ui.ts  # registration screen with the role dropdown
      users.ts        # Drizzle user store (getUser / setRole)
      db/
        schema.ts     # users table + role enum
        index.ts      # Drizzle client
        migrations/   # committed SQL migrations
    docker-compose.yml
    drizzle.config.ts
  api/
    src/
      main.ts         # bootstrap: env, CORS, listen
      app.module.ts   # wires AuthModule + controllers
      admin/          # role-guarded ping + AI governance (usage / model / tool / session)
      auth/           # JWKS verification, guards, decorators
      agent/          # agent runtime, pi telemetry capture + persistence, RAG, admin queries
      analysis/       # content-analysis brief generation, persistence and API
      gaps/           # knowledge-gap log: recording, clustering, labelling and API
      popia/          # POPIA repository, service, controller
      media/          # media fact-check repository, service, AI draft service, controller
    test/             # Vitest e2e specs (supertest)
  website/
    server/auth.ts    # OAuth flow, session cookies, /api/popia proxy, 404
    src/main.tsx      # SPA views per role
    src/lib/session.tsx
    src/popia/        # POPIA desk: submit, track, my requests
      views/
  media-portal/
    server/auth.ts    # OAuth flow, session cookies, /api/media proxy, 404
    src/App.tsx       # media room routing
    src/views/        # home, file a request, my requests, tracking
  control-centre/
    server/auth.ts    # OAuth flow, session cookies, /api/popia, /api/media, /api/analysis, /api/gaps and /api/admin/ai proxy
    src/main.tsx      # Staff/Admin workspace
    src/views/        # POPIA case queue, media fact-check queue, analysis briefs, knowledge gaps and AI governance telemetry
packages/
  agent-contract/     # chat events, UI blocks and AI telemetry spans (shared)
  auth-contract/      # roles + access-token subject schema (shared)
  brief-contract/     # content-analysis brief dimensions, schemas and view shapes (shared)
  gaps-contract/      # knowledge-gap surfaces, category and summary shapes (shared)
  popia-contract/     # POPIA types, statuses, schemas and view shapes (shared)
  popia-ui/           # POPIA API client and request components (shared)
  media-contract/     # media fact-check statuses, schemas and view shapes (shared)
  media-ui/           # media API client, draft card and reference list (shared)
  ui/
  utils/
```
