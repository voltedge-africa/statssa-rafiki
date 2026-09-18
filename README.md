# statssa-rafiki

A Vite+ monorepo for the STATSSA Rafiki auth stack.

| App            | What it is                                                                                                                                     | Stack                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `apps/auth`    | OpenAuth issuer — a standalone auth server with email/password login and a Postgres-backed user store. Issues access tokens carrying a `role`. | Bun, Hono, OpenAuth, Drizzle ORM, Postgres |
| `apps/api`     | NestJS API. Verifies the issuer's Bearer access tokens against its JWKS and enforces roles.                                                    | NestJS (Express), Vitest, Oxc              |
| `apps/website` | The front-end app. Signs users in through the issuer, verifies tokens server-side, and lands them on a role-specific page.                     | Vite (SPA), Node middleware                |

Users register with one of three roles — **Press**, **Staff**, **Admin** — and are redirected to `/press`, `/staff`, or `/admin` after signing in.

The token shape and roles live once in [`packages/auth-contract`](packages/auth-contract) and are shared by the issuer, website and API.

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

# 3. Apply the Drizzle migrations (creates the `users` table and `role` enum)
vp run db:migrate
```

`vp install` also runs `vp config` (git hooks) via the `prepare` script.

### Environment variables (optional)

The defaults work for local development. Copy the examples only if you need to override something:

```bash
cp apps/auth/.env.example apps/auth/.env
cp apps/api/.env.example apps/api/.env
cp apps/website/.env.example apps/website/.env
```

| Variable               | App                     | Default                                               | Purpose                                                                                                    |
| ---------------------- | ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | `apps/auth`             | `postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth` | Postgres connection string.                                                                                |
| `AUTH_PORT`            | `apps/auth`, `apps/api` | `3001`                                                | Port the issuer listens on. The API derives the issuer URL from it.                                        |
| `AUTH_ALLOWED_ORIGINS` | `apps/auth`             | –                                                     | Extra redirect-URI origins (comma-separated `scheme://host`). Same-host clients are allowed automatically. |
| `VITE_AUTH_ISSUER`     | `apps/website`          | derived from the browser hostname                     | Override the issuer URL (only needed behind an HTTPS proxy).                                               |
| `API_PORT`             | `apps/api`              | `3002`                                                | Port the API listens on.                                                                                   |
| `AUTH_ISSUER`          | `apps/api`              | derived from the request host                         | Override the issuer URL. Required in production.                                                           |
| `API_ALLOWED_ORIGINS`  | `apps/api`              | reflect any origin in dev, none in production         | Browser origins allowed by CORS (comma-separated `scheme://host`).                                         |

---

## Run

Three long-running processes, in three terminals, from the repo root:

```bash
# terminal 1 — auth issuer on http://localhost:3001
vp run dev:auth

# terminal 2 — website on http://localhost:5173
vp run dev

# terminal 3 — API on http://localhost:3002
vp run dev:api
```

Open <http://localhost:5173> and click **Sign in or register**.

> The email verification code is printed to **the auth server's terminal** (terminal 1). Watch it there while registering.

### Accessing over Tailscale

All three servers listen on all interfaces, so from another machine on your tailnet open:

```
http://<hostname>:5173     # website
http://<hostname>:3002     # API
```

e.g. `http://armomarchy.taild8f6b9.ts.net:5173`. The website and the API derive the issuer URL from the hostname you used (`http://<hostname>:3001`), so no config is needed. The database stays bound to `127.0.0.1` and is **not** exposed to the tailnet.

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

## Roles and redirects

- Registration asks for a role (**Press**, **Staff**, **Admin**); it is stored per email in Postgres.
- On sign-in the issuer reads the role by email and puts it in the access token's subject.
- `/callback` redirects to `/press`, `/staff`, or `/admin` based on the role.
- Visiting a role page you don't belong to shows **Not authorized**; unknown paths return a real **404**.
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

| Route             | Access   | Returns              |
| ----------------- | -------- | -------------------- |
| `GET /health`     | public   | `{ status, uptime }` |
| `GET /me`         | any role | the caller's subject |
| `GET /admin/ping` | Admin    | role-guard example   |

- The issuer URL is derived from the request host and `AUTH_PORT`, so it works locally and over a
  tailnet. Set `AUTH_ISSUER` to override; it is required in production.
- CORS reflects any origin in development and allows only `API_ALLOWED_ORIGINS` in production, so
  server-to-server calls (like the website's middleware) always work.
- Guards: `@Public()` opts a route out of auth, `@Roles("Admin")` restricts one, and
  `@CurrentUser()` injects the verified subject.

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
    test/             # Vitest e2e specs (supertest)
  website/
    server/auth.ts    # OAuth flow, session cookie, role redirect, 404
    src/main.ts       # SPA views per role
    src/lib/session.tsx
packages/
  auth-contract/      # roles + access-token subject schema (shared)
  ui/
  utils/
```
