# OpenWA API key and authentication: where the dashboard key comes from

Research into how OpenWA authenticates API/dashboard requests, how the first admin key is seeded and stored, and exactly how to retrieve it for the local `openwa-api` Docker stack.

- Date: 2026-09-19
- Status: research / draft — verified against the running `openwa-api` container and the `OpenWA` source checkout; the concrete key path below reflects the stack actually running on this host (a bind mount, not the named volume the task assumed).

> Docs convention: this repo's research notes live in `docs/research/`, e.g. the sibling
> `docs/research/media-portal-inquiry-feed.md`, so this file is placed there and follows the same
> `path:LINE` citation style.

## Scope & method

Primary sources only. Two kinds were used, in this order of authority:

1. The local source checkout at `/home/thuto/Projects/statssa-rafiki/OpenWA/` — application code, dashboard code, OpenAPI spec, `.env.example`, Compose files, and the repo's own `docs/` design docs. Citations are `OpenWA/path:LINE`.
2. The official docs at `https://docs.open-wa.org/` (v0.23.5): Introduction, Quick Start, Configuration, Authentication, Dashboard, and Troubleshooting. Citations are full URLs.

The running container was also inspected directly (bounded commands only: `docker inspect`, `docker exec cat`, `docker logs`, `curl`), because the task's premise about the volume turned out not to match this host — see §5. No blog posts, Stack Overflow, Reddit, or other secondary write-ups were used. Where prose and source disagree, the source is treated as truth and the disagreement is recorded.

## 1. How OpenWA authentication works

### 1.1 The key model: one master seed, many hashed keys

OpenWA has exactly one authentication scheme: an API key sent in a header. There is no separate "master key" type at request time. `API_MASTER_KEY` is not a distinct credential class — it is only the **value used to seed the first admin key** on an empty key table. After seeding, it is an ordinary admin key row like any other.

- Every request is checked by a single global guard, `ApiKeyGuard`, registered as an `APP_GUARD` in `OpenWA/src/modules/auth/auth.module.ts:20-26`.
- Keys live in the `api_keys` table (`OpenWA/src/modules/auth/entities/api-key.entity.ts:10-58`) and carry a role (`admin` / `operator` / `viewer`), optional `allowedIps`, optional `allowedSessions`, `isActive`, `expiresAt`, and usage counters.
- Newly minted keys have the format `owa_k1_<64 hex>` (32 random bytes; 71 chars total) — `OpenWA/src/modules/auth/auth.service.ts:177`, documented at `OpenWA/docs/04-security-design.md:62`.
- Only a SHA-256 (or HMAC-SHA256) hash is stored; the plaintext is returned **once** at creation and never again (`OpenWA/src/modules/auth/auth.controller.ts:66`, `OpenWA/docs/06-api-specification.md:4754`).

So "master key vs per-key keys" is really "the seed value for the first admin key" vs "keys minted later" — all are the same kind of key.

### 1.2 First-boot seeding and precedence

`AuthService.onModuleInit()` runs at boot (`OpenWA/src/modules/auth/auth.service.ts:64`). Its logic:

1. Count existing keys. If the table is **not** empty, skip seeding and just print the banner (`auth.service.ts:66-95`).
2. If empty, resolve the seed value with `resolveSeedApiKey()` (`auth.service.ts:30-37`) and insert it as an `admin` key named `Default Admin Key` (`auth.service.ts:71-73`).

Seed precedence in `resolveSeedApiKey()` (`OpenWA/src/modules/auth/auth.service.ts:30-37`):

| Priority | Source                                       | Resulting key                              |
| -------- | -------------------------------------------- | ------------------------------------------ |
| 1        | `process.env.API_MASTER_KEY` set (non-empty) | taken **verbatim**                         |
| 2        | `process.env.ALLOW_DEV_API_KEY === 'true'`   | fixed, public `dev-admin-key`              |
| 3        | neither set                                  | cryptographically random `owa_k1_<64 hex>` |

The `ALLOW_DEV_API_KEY` branch is only reached if `API_MASTER_KEY` is unset (`auth.service.ts:31-36`), which matches the `.env.example` note "Ignored when API_MASTER_KEY is set" (`OpenWA/.env.example:771`).

### 1.3 Bootstrap file, banner, and staleness

The raw seed key is written to a file so an operator can retrieve it:

- Path resolution: `process.env.BOOTSTRAP_KEY_FILE || join(process.cwd(), 'data', '.api-key')`, resolved **per call** so it can be redirected (`OpenWA/src/modules/auth/bootstrap-key-file.ts:23`). Default is `./data/.api-key`; `/app/data/.api-key` in Docker.
- Written owner-only `0600` via `writeSecretFile` (`bootstrap-key-file.ts:39-41`, `OpenWA/src/common/utils/secret-file.ts:13-24`).
- The file is explicitly **not** read for authentication or seeding — only for the startup banner and backup scripts (`bootstrap-key-file.ts:10-12`). Removing it can never lock anyone out.
- `readLiveBootstrapKey()` re-reads it on later boots, but only advertises it while it still resolves to a live, unexpired key; otherwise the stale file is deleted (`auth.service.ts:124-153`). The file is also removed when its key is revoked or deleted (`auth.service.ts:152-160`).
- Banner masking: the full key is printed **only when it was just created** (`auth.service.ts:47-51`, and `102-106`). On every later boot the line is masked to `owa_k1_x… (full key in data/.api-key or the dashboard)`.

### 1.4 Hashing and the pepper

`hashApiKey(raw, pepper)` uses `createHmac('sha256', pepper)` when `API_KEY_PEPPER` is set, else plain `createHash('sha256')` (`OpenWA/src/modules/auth/api-key-hash.ts:10-14`). Setting or changing the pepper invalidates every existing hash, so it is a deploy-time choice (`.env.example:778-781`). On boot, `load-env.ts` also tightens `.api-key` and `.env.generated` to `0600` on pre-existing installs (`OpenWA/src/config/load-env.ts:33-40`).

### 1.5 Roles and scopes

Roles are hierarchical — `VIEWER (1) < OPERATOR (2) < ADMIN (3)` — enforced by `hasPermission()` (`OpenWA/src/modules/auth/auth.service.ts:485-493`). Scopes:

- `allowedIps` — exact IPs / CIDR ranges; fails closed if the client IP cannot be determined (`auth.service.ts:456-471`).
- `allowedSessions` — session UUIDs; enforced in the guard against the `:sessionId` / session-scoped `:id` route param (`OpenWA/src/modules/auth/guards/api-key.guard.ts:63-77`).
- Scope is checked inside `validateApiKey()` before any role check (`auth.service.ts:433-480`).
- Key-lifecycle routes are additionally fenced by `@RequireUnscopedKey()` so a session-scoped admin cannot mint an unrestricted key (`OpenWA/src/modules/auth/auth.controller.ts:15`, `guards/api-key.guard.ts:96-104`).

### 1.6 The `dev-admin-key`

`ALLOW_DEV_API_KEY=true` seeds the literal, public string `dev-admin-key` as an ADMIN credential (`auth.service.ts:34-36`). It is refused in anything that is not `development`/`test` at boot: `assertNoDefaultSecretsInProduction()` treats a set `ALLOW_DEV_API_KEY=true` as a fatal problem (`OpenWA/src/config/bootstrap-security.ts:242-245`), and `dev-admin-key` is on the forbidden-secret denylist (`bootstrap-security.ts:116`).

**On this host it is not active**: `ALLOW_DEV_API_KEY` is blank in the container (`docker inspect openwa-api`), and `curl -X POST /api/auth/validate -H "X-API-Key: dev-admin-key"` returned `401`. So `dev-admin-key` will **not** sign in to this dashboard.

## 2. Where to get the API key (the user's situation)

### 2.1 What is actually running here (verified)

Inspecting the live container resolved an important mismatch:

- Container: `openwa-api`, image `openwa-openwa`, status `Up … (healthy)`.
- Compose file that created it: `/home/thuto/Projects/statssa-rafiki/OpenWA/docker-compose.dev.yml` (from the container's `com.docker.compose.project.config_files` label).
- Mount: a **bind mount**, not a named volume — `/home/thuto/Projects/statssa-rafiki/OpenWA/data` → `/app/data`.
- `docker volume ls` shows **no** `openwa_openwa-data` volume on this host; `docker inspect openwa_openwa-data` returns "no such object".
- Relevant env in the container: `NODE_ENV=development`, `PORT=2785`, `API_MASTER_KEY=` (blank), `ALLOW_DEV_API_KEY=` (blank), `BOOTSTRAP_KEY_FILE=` (blank), `API_KEY_PEPPER=` (blank).

So this stack is the **development Compose** file (`docker-compose.dev.yml`), which mounts `./data:/app/data` (`OpenWA/docker-compose.dev.yml:283-284`) and forwards `API_MASTER_KEY`, `ALLOW_DEV_API_KEY`, `API_KEY_PEPPER`, `BOOTSTRAP_KEY_FILE` from the host `.env` (`docker-compose.dev.yml:157-160`). Because all four are blank, the random first-boot key is the live credential.

### 2.2 The direct answer — first-boot generated key

The current admin key is the random first-boot key in `data/.api-key`. It was verified live: reading the file and calling `/api/auth/validate` returned `{"valid":true,"role":"admin"}`.

The most portable command (works regardless of bind mount vs named volume, because it runs inside the container):

```bash
docker exec openwa-api cat /app/data/.api-key
```

For this bind-mount stack, the same file is directly readable on the host (owned by the container's `openwa` user, uid 997, mode `0600`, so you may need `sudo`):

```bash
sudo cat /home/thuto/Projects/statssa-rafiki/OpenWA/data/.api-key
```

Then log into the dashboard at `http://localhost:2785` by pasting the value into the API-key field (see §4.2). The value is a 71-char string beginning `owa_k1_`.

If you ever need to **redirect** the bootstrap file (read-only data dir, mounted secret), set `BOOTSTRAP_KEY_FILE`; the resolution honours it per call (`OpenWA/src/modules/auth/bootstrap-key-file.ts:17-23`), and both Compose files forward it (`docker-compose.yml:278`, `docker-compose.dev.yml:160`).

### 2.3 The `ALLOW_DEV_API_KEY=true` → `dev-admin-key` path

Only if you set `ALLOW_DEV_API_KEY=true` **and** leave `API_MASTER_KEY` blank, the seed becomes the fixed `dev-admin-key` (`OpenWA/src/modules/auth/auth.service.ts:31-36`). For local development this is a convenience: the well-known value is easy to type. It is not enabled on this host (blank env; `dev-admin-key` got `401`), it is refused outside dev/test, and the docs explicitly warn it "seeds the publicly-documented `dev-admin-key` as an ADMIN credential" (`OpenWA/src/config/bootstrap-security.ts:242-245`).

Important: this path only affects the **seed** key. It does nothing once the `api_keys` table already has rows — the boot seed only fires on an empty table (`auth.service.ts:66`). On this host a key already exists, so flipping the env var now would not make `dev-admin-key` valid.

### 2.4 The `API_MASTER_KEY` path

Set `API_MASTER_KEY` to your own long secret and it is taken verbatim as the first admin key (`auth.service.ts:31-32`; docs at `OpenWA/docs/04-security-design.md:68-70`). In production it must be at least 32 chars and not a known default, or boot refuses (`OpenWA/src/config/bootstrap-security.ts:108`, `226-235`). Both Compose files forward it: `OpenWA/docker-compose.yml:270`, `OpenWA/docker-compose.dev.yml:157`. Same caveat: it only seeds an **empty** table.

### 2.5 Reading the key out of a Docker named volume

The task described the production layout: volume `openwa_openwa-data` mounted at `/app/data` in container `openwa-api`. That layout is defined by `OpenWA/docker-compose.yml:386-387` (`openwa-data:/app/data`) and declared at `docker-compose.yml:517-518` (`name: openwa_openwa-data`). If/when this stack runs under that file, the key is still at `/app/data/.api-key` inside the container, so the same one-liner works:

```bash
docker exec openwa-api cat /app/data/.api-key
```

To reach it from the host without a bind mount, use a throwaway container with the volume mounted:

```bash
docker run --rm -v openwa_openwa-data:/app/data alpine cat /app/data/.api-key
```

Or copy it out:

```bash
docker cp openwa-api:/app/data/.api-key ./openwa-api-key
```

**But this is not what is running right now.** There is no `openwa_openwa-data` volume on this host; the live mount is the bind mount in §2.1. Use the `docker exec` form, which is correct for both layouts.

### 2.6 Reading the key from container logs

The startup banner prints the key (`OpenWA/src/modules/auth/auth.service.ts:98-106`), but the full value **only on the boot that created it** — later boots log a masked fingerprint (`auth.service.ts:47-51`). For this container the creating boot is still in the log ring buffer. To find the banner line without dumping the whole log:

```bash
docker logs openwa-api 2>&1 | grep -A2 "API Key"
```

If the key was created on an earlier boot or the log has rotated, this only shows the masked form (`owa_k1_x…`) — read `data/.api-key` instead. Do not rely on logs as the durable source; the file is the durable one.

## 3. Creating additional API keys once authenticated

### 3.1 From the dashboard

Once signed in with an admin key, the sidebar shows **API Keys** (admin-only route, `OpenWA/dashboard/src/App.tsx:117`). The page (`OpenWA/dashboard/src/pages/ApiKeys.tsx`) can list keys by prefix, create keys (name + role, optionally session-scoped for operator/viewer), re-scope, revoke, and delete. The full plaintext is shown **once** in a copy panel on creation (`ApiKeys.tsx:109`, `331-365`), and every later list shows only `keyPrefix`. If a key is lost, revoke it and mint a new one (`https://docs.open-wa.org/guides/dashboard`).

### 3.2 Key-management API endpoints

Controller `@Controller('auth/api-keys')` with the global `api` prefix → `/api/auth/api-keys` (`OpenWA/src/modules/auth/auth.controller.ts:12`). Every route requires `@RequireRole(ADMIN)` and the whole controller is `@RequireUnscopedKey()`:

| Method   | Path                            | Result                                                | Cite                                                       |
| -------- | ------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `POST`   | `/api/auth/api-keys`            | Create; returns full `apiKey` once                    | `auth.controller.ts:36-66`                                 |
| `GET`    | `/api/auth/api-keys`            | List (prefix only)                                    | `auth.controller.ts:70`                                    |
| `GET`    | `/api/auth/api-keys/:id`        | Get one                                               | `auth.controller.ts:95-96`                                 |
| `PUT`    | `/api/auth/api-keys/:id`        | Update name/role/allowedIps/allowedSessions/expiresAt | `auth.controller.ts:120-121`                               |
| `POST`   | `/api/auth/api-keys/:id/revoke` | Set `isActive:false`                                  | `auth.controller.ts:178-179`                               |
| `DELETE` | `/api/auth/api-keys/:id`        | Delete permanently                                    | `auth.controller.ts:163-164`                               |
| `POST`   | `/api/auth/validate`            | Validate caller's own key; returns role               | `OpenWA/src/modules/auth/auth-validate.controller.ts:9-11` |

Create body fields: `name` (3-100, required), `role` (`admin`/`operator`/`viewer`, default `operator`), `allowedIps` (IPv4/CIDR), `allowedSessions` (session UUIDs, unique, non-empty, no commas), `expiresAt` (ISO 8601) — `OpenWA/src/modules/auth/dto/api-key.dto.ts` (the `CreateApiKeyDto` class), and documented at `OpenWA/docs/06-api-specification.md:4754-4800`.

Example (after exporting the admin key):

```bash
K=$(docker exec openwa-api cat /app/data/.api-key)
curl -X POST http://localhost:2785/api/auth/api-keys \
  -H "X-API-Key: $K" -H "Content-Type: application/json" \
  -d '{"name":"n8n integration","role":"operator"}'
```

### 3.3 Scopes / roles

Roles: `viewer` (read-only), `operator` (writes/actions), `admin` (key management, settings, infra) — hierarchical, so an admin key passes operator routes (`OpenWA/src/modules/auth/auth.service.ts:485-493`; `https://docs.open-wa.org/guides/authentication`). Scopes: `allowedIps` and `allowedSessions` as in §1.5. A scope violation returns `401`; a role shortfall returns `403`. The last usable unscoped admin cannot be demoted/revoked/deleted/expired (`OpenWA/src/modules/auth/auth.service.ts:357-378`).

## 4. How the whole thing works

### 4.1 Dashboard and API on one port

The React dashboard is bundled into the API image and served by NestJS on the same port as the API — `2785`. There is no separate dashboard container (`OpenWA/docker-compose.yml:417-418`; `https://docs.open-wa.org/`). The production Compose binds `127.0.0.1:${API_PORT:-2785}:2785` and exposes `2785` internally (`docker-compose.yml:95-98`); the dev Compose binds `${BIND_HOST:-127.0.0.1}:2785:2785` (`docker-compose.dev.yml:39`). The API lives under the `/api` global prefix, so `/api/sessions`, `/api/health`, and also `/api/auth/api-keys`. Swagger UI (opt-in, off in production) is at `/api/docs`.

### 4.2 How the key is sent

Header name is **`X-API-Key`** (case-insensitive). The guard also accepts `Authorization: Bearer <key>` as a fallback (`OpenWA/src/modules/auth/guards/api-key.guard.ts:116-124`). The OpenAPI spec declares the security scheme as an apiKey header named `X-API-Key` and applies it globally (`OpenWA/openapi.json`, `components.securitySchemes` / top-level `security`). Query-parameter keys are not accepted. The dashboard:

- Login page POSTs `/auth/validate` with `X-API-Key` (`OpenWA/dashboard/src/pages/Login.tsx:36-42`).
- On success the key is stored in **`sessionStorage`** under `openwa_api_key` (`OpenWA/dashboard/src/App.tsx:42-54`).
- Every subsequent API call reads it from `sessionStorage` and sets the `X-API-Key` header (`OpenWA/dashboard/src/services/api.ts:719-727`); the WebSocket handshake does the same (`dashboard/src/hooks/useWebSocket.ts:164-184`).
- A `401` clears the stored key and returns to the login screen (`api.ts:684-695`).

Because it is `sessionStorage` (not `localStorage`), the key does not survive closing the browser tab — you re-paste it on a fresh tab.

### 4.3 The auth guard

`ApiKeyGuard` is a global `APP_GUARD` (`OpenWA/src/modules/auth/auth.module.ts:20-26`). Per request it: extracts the key header (`guard.ts:116-124`), resolves the session id for scope checks (`guard.ts:63-77`), calls `validateApiKey()` which checks hash, `isActive`, `expiresAt`, IP allowlist, and session allowlist (`auth.service.ts:433-480`), stamps the actor for audit, then enforces `@RequireRole` and `@RequireUnscopedKey` (`guard.ts:87-104`). Routes marked `@Public()` bypass it entirely (health endpoints, metrics). Rejected auth writes an `api_key_auth_failed` audit row (`guard.ts:31-46`).

### 4.4 Sessions, webhooks, and the rest

Once authenticated, the dashboard maps almost 1:1 onto documented REST routes: sessions (create/start/stop/QR/pairing), chats, webhooks (per-session, HMAC-signed, visual filter builder), templates, message tester, audit logs, infrastructure config, and plugins (`https://docs.open-wa.org/guides/dashboard`). The dashboard is a thin front end over `http://localhost:2785/api`. Real-time updates (session status, chat threads) arrive over a Socket.IO namespace `/events`, authenticated with the same key via `auth.apiKey` or the `X-API-Key` header (`https://docs.open-wa.org/guides/authentication`; `OpenWA/docs/06-api-specification.md:23`).

## 5. Caveats and disagreements

1. **The named volume in the task description does not exist on this host.** The running stack uses `docker-compose.dev.yml` with a bind mount `./data:/app/data`, not the production file's `openwa_openwa-data` volume. The correct retrieval command for the current stack is `docker exec openwa-api cat /app/data/.api-key` or `sudo cat OpenWA/data/.api-key`; the `openwa_openwa-data` instructions in §2.5 apply only if the production Compose file is used. Verified directly with `docker inspect openwa-api` and `docker volume ls`.
2. **`ALLOW_DEV_API_KEY` is blank here and `dev-admin-key` is rejected** (`401`). Only the random first-boot key works. It was verified live: the file key returns `{"valid":true,"role":"admin"}`.
3. **`keyPrefix` length comment drift.** The DTO/Swagger comment says "First 8 characters" (`OpenWA/src/modules/auth/dto/api-key.dto.ts`, `ApiKeyResponseDto.keyPrefix`), but the implementation stores 12 (`auth.service.ts:163`, `179`), the entity column is `varchar(12)`, and the docs say 12 (`docs/04-security-design.md:65`). The code/docs are authoritative; the DTO description is stale.
4. **`.env.example` vs precedence.** The `ALLOW_DEV_API_KEY` comment says "Ignored when API_MASTER_KEY is set" (`.env.example:771`), which matches `resolveSeedApiKey()` exactly — no disagreement.
5. **Seeding only on an empty table.** None of `API_MASTER_KEY`, `ALLOW_DEV_API_KEY`, or `BOOTSTRAP_KEY_FILE` can change an existing installation's key; they only affect the first boot when `api_keys` is empty (`auth.service.ts:66-80`). To rotate, use the key-management API/dashboard, not env changes.
6. **Docs Quick Start assumes a `./data` bind mount and `openwa-api` container name** (`https://docs.open-wa.org/getting-started/quick-start`), which happens to match this host's dev stack, even though the task premise named the production volume. The official quick-start `docker exec openwa-api cat /app/data/.api-key` is the right command here.

## 6. Sources

### Repo files (read this session, targeted)

- `OpenWA/src/modules/auth/auth.service.ts`, `bootstrap-key-file.ts`, `api-key-hash.ts`, `auth.controller.ts`, `auth-validate.controller.ts`, `auth.module.ts`, `api-key-authorization.ts`
- `OpenWA/src/modules/auth/guards/api-key.guard.ts`, `entities/api-key.entity.ts`, `decorators/auth.decorators.ts`, `dto/api-key.dto.ts`
- `OpenWA/src/config/bootstrap-security.ts`, `load-env.ts`
- `OpenWA/src/common/utils/secret-file.ts`
- `OpenWA/.env.example` (Security section), `OpenWA/.env.minimal`
- `OpenWA/docker-compose.yml`, `OpenWA/docker-compose.dev.yml`, `OpenWA/docker-entrypoint.sh`
- `OpenWA/openapi.json` (`components.securitySchemes`, `security`, auth paths)
- `OpenWA/dashboard/src/pages/Login.tsx`, `pages/ApiKeys.tsx`, `App.tsx`, `services/api.ts`, `hooks/useWebSocket.ts`
- `OpenWA/docs/04-security-design.md`, `docs/06-api-specification.md` (§§6.1, 6.4.9), `docs/11-operational-runbooks.md` (backup/restore), `docs/12-troubleshooting-faq.md`

### Official docs (fetched)

- `https://docs.open-wa.org/` — Introduction
- `https://docs.open-wa.org/getting-started/quick-start` — "Get your API key"
- `https://docs.open-wa.org/getting-started/configuration` — Security / API key authentication
- `https://docs.open-wa.org/guides/authentication` — full auth model, roles, scopes, key lifecycle
- `https://docs.open-wa.org/guides/dashboard` — dashboard sign-in and API Keys page
- `https://docs.open-wa.org/reference/troubleshooting` — 401/403 guidance, diagnostics

### Live host checks (bounded)

- `docker ps`, `docker inspect openwa-api` (mounts, env, compose label), `docker volume ls`
- `docker exec openwa-api cat /app/data/.api-key` + `curl -X POST /api/auth/validate` → `{"valid":true,"role":"admin"}`
- `curl -X POST /api/auth/validate -H "X-API-Key: dev-admin-key"` → `401`
- `docker logs openwa-api` (startup banner / auth route mapping)
