# @voltedge/auth-contract

The single source of truth for the Rafiki auth contract:

- `ROLES` / `Role` / `DEFAULT_ROLE` / `isRole` — the roles a user can register with.
- `subjects` — the OpenAuth access-token subject schema (`{ id, role }`).
- `AuthUser` — the verified token payload as a TypeScript type.

`apps/auth` (issuer), `apps/website` (session verification) and `apps/api` (Bearer verification)
all consume this package so the token shape cannot drift.

## Build

```bash
vp run @voltedge/auth-contract#build
```

Consumers resolve the built `dist/`, so build after changing the contract before running an app.
