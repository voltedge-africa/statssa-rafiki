# statssa-rafiki

A Vite+ monorepo for the STATSSA Rafiki auth stack.

| App                   | What it is                                                                                                                                                                         | Stack                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `apps/auth`           | OpenAuth issuer — a standalone auth server with email/password login and a Postgres-backed user store. Issues access tokens carrying a `role`.                                     | Bun, Hono, OpenAuth, Drizzle ORM, Postgres |
| `apps/api`            | NestJS API. Grounded chat agent over a local Stats SA corpus, plus JWKS token verification, role guards and the POPIA request desk.                                                | NestJS (Express), pgvector, Vitest, Oxc    |
| `apps/website`        | The public front-end. Signs users in through the issuer, serves the POPIA request desk at `/popia` (footer links only), and sends Staff/Admin to the control centre after sign-in. | Vite (React SPA), Node middleware          |
| `apps/public-portal`  | The public chat portal on port 3003. Answers statistics questions from the API's RAG corpus. Linked from the website hero.                                                         | Vite (React SPA)                           |
| `apps/control-centre` | The Staff/Admin workspace on port 3006. Signs in through the issuer and works the POPIA case queue.                                                                                | Vite (React SPA), Node middleware          |

Users register with one of three roles — **Press**, **Staff**, **Admin**. After signing in, **Press** lands on `/press`; **Staff** and **Admin** are redirected to the control centre (port 3006).

The token shape and roles live once in [`packages/auth-contract`](packages/auth-contract) and are shared by the issuer, website and API. The POPIA vocabulary (request types, statuses, lifecycle and view shapes) lives once in [`packages/popia-contract`](packages/popia-contract) and is shared by the API, website and database enums.

---

## Prerequisites

- **Vite+ (`vp`)** — the toolchain used to install, run, and check everything.
  ```bash
  curl -fsSL https://vite.plus | bash
  ```
- **Docker + Docker Compose** — runs the Postgres container.
- **Node.js >= 22.12.0** (declared in `engines`). `vp` can manage the runtime for you.

Verify:

```bash
vp --version
docker compose version
```

---

## First-time setup

Run these once after cloning (and after pulling changes that touch dependencies or migrations):

```bash
# 1. Install all workspace dependencies
vp install

# 2. Start Postgres (apps/auth/docker-compose.yml, bound to 127.0.0.1:5432)
vp run db:up

# 3. Apply the Drizzle migrations (creates the `users` table, `role` enum and the POPIA tables)
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
cp apps/control-centre/.env.example apps/control-centre/.env
```

| Variable                  | App                                                            | Default                                               | Purpose                                                                                                    |
| ------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | `apps/auth`, `apps/api`                                        | `postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth` | Postgres connection string. The API reads the same database for POPIA requests.                            |
| `AUTH_PORT`               | `apps/auth`, `apps/api`, `apps/website`, `apps/control-centre` | `3000`                                                | Port the issuer listens on. The API and both apps derive the issuer URL from it.                           |
| `AUTH_ALLOWED_ORIGINS`    | `apps/auth`                                                    | –                                                     | Extra redirect-URI origins (comma-separated `scheme://host`). Same-host clients are allowed automatically. |
| `VITE_AUTH_ISSUER`        | `apps/website`, `apps/control-centre`                          | derived from the browser hostname                     | Override the issuer URL (only needed behind an HTTPS proxy).                                               |
| `API_PORT`                | `apps/api`                                                     | `3001`                                                | Port the API listens on.                                                                                   |
| `AUTH_ISSUER`             | `apps/api`                                                     | derived from the request host                         | Override the issuer URL. Required in production.                                                           |
| `API_ALLOWED_ORIGINS`     | `apps/api`                                                     | reflect any origin in dev, none in production         | Browser origins allowed by CORS (comma-separated `scheme://host`).                                         |
| `RAG_DATABASE_URL`        | `apps/api`                                                     | `postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_rag`  | Postgres database holding the RAG index (needs the `pgvector` extension).                                  |
| `VITE_API_BASE`           | `apps/public-portal`, `apps/website`, `apps/control-centre`    | `http://localhost:3001`                               | API base the portal calls (website and control centre proxy `/api/popia/*` through their servers).         |
| `VITE_CONTROL_CENTRE_URL` | `apps/website`                                                 | derived from the browser hostname, port 3006          | Where Staff/Admin are sent after signing in.                                                               |
| `VITE_WEBSITE_URL`        | `apps/control-centre`                                          | derived from the browser hostname, port 3002          | Public site linked from the control centre header.                                                         |

---

## Run

Five long-running processes, in five terminals, from the repo root:

```bash
# terminal 1 — auth issuer on http://localhost:3000
vp run dev:auth

# terminal 2 — website (and POPIA desk) on http://localhost:3002
vp run dev

# terminal 3 — API on http://localhost:3001
vp run dev:api

# terminal 4 — public chat portal on http://localhost:3003
vp run dev:public

# terminal 5 — control centre on http://localhost:3006
vp run dev:control
```

Or run everything in one terminal with labelled, interleaved output:

```bash
vp run dev:all
```

That prebuilds the shared packages and then runs the auth issuer, API, website, public portal and
control centre together with [`concurrently`](https://github.com/open-cli-tools/concurrently).
**Ctrl+C stops all five**; don't kill the individual processes, as their children (Bun, Nest) can
outlive them.

Open <http://localhost:3002> and click **Sign in or register**. POPIA requests live at
<http://localhost:3002/popia> and are linked from the footer. Staff and Admin sign in to the
control centre at <http://localhost:3006> to work the case queue.

> Verification codes arrive in Mailpit at <http://localhost:8025> (started by `vp run db:up`). If
> SMTP is unconfigured, they are printed to the auth server's terminal instead.

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

### Accessing over Tailscale

All dev servers listen on all interfaces, so from another machine on your tailnet open:

```
http://<hostname>:3002     # website (and /popia)
http://<hostname>:3003     # public portal
http://<hostname>:3001     # API
http://<hostname>:3006     # control centre
```

e.g. `http://armomarchy.taild8f6b9.ts.net:3002`. The website, the control centre and the API derive the issuer URL from the hostname you used (`http://<hostname>:3000`), so no config is needed. The database stays bound to `127.0.0.1` and is **not** exposed to the tailnet.

---

## Database

The dev database is defined in [`apps/auth/docker-compose.yml`](apps/auth/docker-compose.yml) and stored in the `auth_rafiki-auth-postgres` volume.

| Command              | Does                                                        |
| -------------------- | ----------------------------------------------------------- |
| `vp run db:up`       | Start Postgres (`docker compose up -d`).                    |
| `vp run db:down`     | Stop Postgres (keeps data).                                 |
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

| Route                                   | Access       | Returns                                        |
| --------------------------------------- | ------------ | ---------------------------------------------- |
| `GET /health`                           | public       | `{ status, uptime }`                           |
| `GET /me`                               | any role     | the caller's subject                           |
| `GET /admin/ping`                       | Admin        | role-guard example                             |
| `POST /popia/requests`                  | public       | submit a request; a token links it to account  |
| `POST /popia/requests/track`            | public       | track by reference + email                     |
| `GET /popia/requests/mine`              | any role     | requests linked to the caller                  |
| `GET /popia/requests`                   | Staff, Admin | case queue (`status`, `type`, `assigned`, `q`) |
| `GET /popia/requests/:reference`        | Staff, Admin | case file with the full timeline               |
| `PATCH /popia/requests/:reference`      | Staff, Admin | status, assignment or resolution               |
| `POST /popia/requests/:reference/notes` | Staff, Admin | internal or requester-visible note             |

- The issuer URL is derived from the request host and `AUTH_PORT`, so it works locally and over a
  tailnet. Set `AUTH_ISSUER` to override; it is required in production.
- CORS reflects any origin in development and allows only `API_ALLOWED_ORIGINS` in production, so
  server-to-server calls (like the website's middleware) always work.
- Guards: `@Public()` opts a route out of auth, `@OptionalAuth()` treats a missing token as
  anonymous but still verifies one that is present, `@Roles("Admin")` restricts a route, and
  `@CurrentUser()` injects the verified subject.

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

Neither app exposes tokens to the browser: their Vite middleware runs the OpenAuth flow with
httpOnly cookies and proxies `/api/popia/*` to `apps/api` with the session token attached. POPIA
data lives in `rafiki_auth` (`popia_requests` + `popia_request_events`); the vocabulary, status
transitions and validation schemas are defined in
[`packages/popia-contract`](packages/popia-contract), and the shared API client and request
components in [`packages/popia-ui`](packages/popia-ui).

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
      admin/          # role-guarded example controller
      auth/           # JWKS verification, guards, decorators
      popia/          # POPIA repository, service, controller
    test/             # Vitest e2e specs (supertest)
  website/
    server/auth.ts    # OAuth flow, session cookies, /api/popia proxy, 404
    src/main.tsx      # SPA views per role
    src/lib/session.tsx
    src/popia/        # POPIA desk: submit, track, my requests
      views/
  control-centre/
    server/auth.ts    # OAuth flow, session cookies, /api/popia proxy
    src/main.tsx      # Staff/Admin workspace
    src/views/        # POPIA case queue
packages/
  auth-contract/      # roles + access-token subject schema (shared)
  popia-contract/     # POPIA types, statuses, schemas and view shapes (shared)
  popia-ui/           # POPIA API client and request components (shared)
  ui/
  utils/
```
