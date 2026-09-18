# @voltedge/media-contract

The single source of truth for the Rafiki media room contract:

- `MEDIA_REQUEST_STATUSES` / `MEDIA_EVENT_KINDS` — the vocabulary shared by the API, the media
  portal and the database enums.
- `MEDIA_STATUS_TRANSITIONS` / `canTransition` / `isOpenStatus` — the fact-check request lifecycle.
  Every request passes through `analysing` and `awaiting_review`; only a Staff/Admin approval
  reaches `approved`, and `information_gap` records that no unsupported content was generated.
- `submitMediaRequestSchema`, `updateMediaRequestSchema`, `approveMediaRequestSchema`,
  `rejectMediaRequestSchema`, `createMediaNoteSchema` — valibot schemas for every request body.
- `MediaRequestPublic`, `MediaRequestTracking`, `MediaRequestStaff`, `MediaRequestStaffDetail` —
  the API view shapes. The AI draft and assignment appear only in the staff views.
- `extractCitationIds` — pulls `[source#chunk]` ids out of a draft or approved response.

`apps/api` (media endpoints), `apps/media-portal` (requester UI) and `apps/control-centre`
(media desk) all consume this package.

## Build

```bash
vp run @voltedge/media-contract#build
```

Consumers resolve the built `dist/`, so build after changing the contract before running an app.
