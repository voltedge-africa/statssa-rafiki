# statssa-rafiki

A Vite+ monorepo for the STATSSA Rafiki auth stack.

| App                   | What it is                                                                                                                                                                         | Stack                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `apps/auth`           | OpenAuth issuer — a standalone auth server with email/password login and a Postgres-backed user store. Issues access tokens carrying a `role`.                                     | Bun, Hono, OpenAuth, Drizzle ORM, Postgres |
| `apps/api`            | NestJS API. Grounded chat agent over a local Stats SA corpus, plus JWKS token verification, role guards and the POPIA request desk.                                                | NestJS (Express), pgvector, Vitest, Oxc    |
| `apps/website`        | The public front-end. Signs users in through the issuer, serves the POPIA request desk at `/popia` (footer links only), and sends Staff/Admin to the control centre after sign-in. | Vite (React SPA), Node middleware          |
| `apps/public-portal`  | The public chat portal on port 3003. Answers statistics questions from the API's RAG corpus. Linked from the website hero.                                                         | Vite (React SPA)                           |
| `apps/media-portal`   | The media room on port 3004. Signed-in users file fact-check requests, watch them move through human review and read the approved, referenced response.                            | Vite (React SPA), Node middleware          |
| `apps/control-centre` | The Staff/Admin workspace on port 3006. Signs in through the issuer, works the POPIA case queue and reviews media fact-check drafts on the media desk.                             | Vite (React SPA), Node middleware          |

Users register with one of three roles — **Press**, **Staff**, **Admin**. After signing in, **Press** lands on `/press`; **Staff** and **Admin** are redirected to the control centre (port 3006).

The token shape and roles live once in [`packages/auth-contract`](packages/auth-contract) and are shared by the issuer, website and API. The POPIA vocabulary (request types, statuses, lifecycle and view shapes) lives once in [`packages/popia-contract`](packages/popia-contract) and is shared by the API, website and database enums. The media vocabulary (fact-check statuses, lifecycle, draft and view shapes) lives once in [`packages/media-contract`](packages/media-contract) and is shared by the API, media portal, control centre and database enums.

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

| Route                                        | Access        | Returns                                                |
| -------------------------------------------- | ------------- | ------------------------------------------------------ |
| `GET /health`                                | public        | `{ status, uptime }`                                   |
| `GET /me`                                    | any role      | the caller's subject                                   |
| `GET /admin/ping`                            | Admin         | role-guard example                                     |
| `POST /popia/requests`                       | public        | submit a request; a token links it to account          |
| `POST /popia/requests/track`                 | public        | track by reference + email                             |
| `GET /popia/requests/mine`                   | any role      | requests linked to the caller                          |
| `GET /popia/requests`                        | Staff, Admin  | case queue (`status`, `type`, `assigned`, `q`)         |
| `GET /popia/requests/:reference`             | Staff, Admin  | case file with the full timeline                       |
| `PATCH /popia/requests/:reference`           | Staff, Admin  | status, assignment or resolution                       |
| `POST /popia/requests/:reference/notes`      | Staff, Admin  | internal or requester-visible note                     |
| `POST /media/requests`                       | any signed-in | submit a media fact-check request (starts AI drafting) |
| `GET /media/requests/mine`                   | any signed-in | the caller's media requests                            |
| `GET /media/requests/mine/:reference`        | owner         | request tracking plus the approved response            |
| `POST /media/requests/:reference/withdraw`   | owner         | withdraw an open request                               |
| `GET /media/requests`                        | Staff, Admin  | media queue (`status`, `assigned`, `q`)                |
| `GET /media/requests/:reference`             | Staff, Admin  | media case file including the AI draft                 |
| `PATCH /media/requests/:reference`           | Staff, Admin  | status, assignment or a lifecycle note                 |
| `POST /media/requests/:reference/approve`    | Staff, Admin  | approve and release the reviewed response              |
| `POST /media/requests/:reference/reject`     | Staff, Admin  | decline with a requester-visible reason                |
| `POST /media/requests/:reference/regenerate` | Staff, Admin  | rebuild the grounded draft                             |
| `POST /media/requests/:reference/notes`      | Staff, Admin  | internal or requester-visible note                     |

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
    server/auth.ts    # OAuth flow, session cookies, /api/popia and /api/media proxy
    src/main.tsx      # Staff/Admin workspace
    src/views/        # POPIA case queue and media fact-check queue
packages/
  auth-contract/      # roles + access-token subject schema (shared)
  popia-contract/     # POPIA types, statuses, schemas and view shapes (shared)
  popia-ui/           # POPIA API client and request components (shared)
  media-contract/     # media fact-check statuses, schemas and view shapes (shared)
  media-ui/           # media API client, draft card and reference list (shared)
  ui/
  utils/
```
