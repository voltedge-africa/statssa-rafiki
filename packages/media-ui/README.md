# @voltedge/media-ui

The shared media-room surface:

- `submitMediaRequest`, `listMyMediaRequests`, `getMyMediaRequest`, `withdrawMediaRequest` — the
  requester client against `/api/media`.
- `listMediaRequests`, `getMediaRequest`, `updateMediaRequest`, `approveMediaRequest`,
  `rejectMediaRequest`, `regenerateMediaRequest`, `addMediaNote` — the reviewer client.
- `RequestFile` — the request case file, with `DraftCard` (always badged as AI-generated and
  unreviewed) and `SourceReferences` for the grounded citations.
- `StatusBadge`, `RequestTimeline`, `formatDate`, `fieldErrors`.

`apps/media-portal` (requester surface) and `apps/control-centre` (media desk) both consume this
package.

## Build

```bash
vp run @voltedge/media-ui#build
```

Consumers resolve the built `dist/`, so build after changing the surface before running an app.
