# @voltedge/popia-ui

Shared POPIA surface used by `apps/website` (submit, track, my requests) and
`apps/control-centre` (case queue):

- `.../api` — the typed client for `/api/popia/*` (both apps proxy it same-origin).
- `format` / `forms` — date, deadline and form-error helpers.
- `RequestFile`, `RequestTimeline`, `StatusBadge`, `Fact` — the request presentation used by
  requesters and case workers.

## Build

```bash
vp run @voltedge/popia-ui#build
```

Consumers resolve the built `dist/`, so rebuild after changing the surface.
