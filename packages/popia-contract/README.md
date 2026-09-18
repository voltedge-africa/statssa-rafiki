# @voltedge/popia-contract

The single source of truth for the Rafiki POPIA portal contract:

- `POPIA_REQUEST_TYPES` / `POPIA_REQUEST_STATUSES` / `POPIA_EVENT_KINDS` — the vocabulary shared
  by the API, the POPIA portal and the database enums.
- `POPIA_STATUS_TRANSITIONS` / `canTransition` / `isOpenStatus` — the request lifecycle rules.
- `submitPopiaRequestSchema`, `trackPopiaRequestSchema`, `updatePopiaRequestSchema`,
  `createPopiaNoteSchema` — valibot schemas for every request body.
- `PopiaRequestPublic`, `PopiaRequestTracking`, `PopiaRequestStaff`,
  `PopiaRequestStaffDetail` — the API view shapes, so the API and portal cannot drift.

`apps/api` (POPIA endpoints) and `apps/popia-portal` (UI and client validation) both consume this
package.

## Build

```bash
vp run @voltedge/popia-contract#build
```

Consumers resolve the built `dist/`, so build after changing the contract before running an app.
