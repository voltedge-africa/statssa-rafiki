# Media portal inquiry feed: current state and CRUD-bound design

Research into what exists in the media room (port 3004, Press role) versus the requested FEED + SIDEBAR + SEARCH + CREATE feature, with a proposed API-bound design.

- Date: 2026-09-18
- Status: research / draft — §4 has since been implemented on this branch (media-room feed + sidebar); kept as the design record.

> Docs convention: this repo has no `docs/` directory or research-notes convention at all
> (verified: no `docs/` anywhere, and the only `.md` files are READMEs and AGENTS/CLAUDE
> instructions). The sibling repo `../rafiki-rag-core/docs/research/` does keep research notes,
> so this file follows that location.

## Scope & method

Primary sources only: actual source code, schemas, and contracts in this repo. All citations are
`path:LINE` into real files read in this session. No blog posts or secondary summaries were used;
no first-party library docs were needed beyond package manifests (no router or query library is
declared — see §7).

## 1. Current state

### 1.1 Media portal route map (apps/media-portal)

Routing is a hand-rolled switch on the current path in `apps/media-portal/src/App.tsx:19-29`:

| Path             | View                                                                           | What it does today                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`              | `HomeView` (`apps/media-portal/src/views/home-view.tsx:114`)                   | Marketing/how-it-works page + "Your requests" list of the 3 most recent of the user's own requests (`home-view.tsx:124-126`, `listMyMediaRequests()`). No feed of official responses exists.                                                                  |
| `/request`       | `RequestView` (`apps/media-portal/src/views/request-view.tsx:45`)              | "Create new" form: valibot-validated (`request-view.tsx:61-71`, `submitMediaRequestSchema`) then `submitMediaRequest(...)`, navigates to the new request's detail page (`request-view.tsx:77-84`).                                                            |
| `/requests`      | `MyRequestsView` (`apps/media-portal/src/views/my-requests-view.tsx:25`)       | Flat list of ALL of the user's own requests via `listMyMediaRequests()` (`my-requests-view.tsx:30-43`), split open/closed client-side (`my-requests-view.tsx:69-70`), 5 s polling while any are active (`my-requests-view.tsx:46-50`). No sidebar, no search. |
| `/requests/:ref` | `RequestDetailView` (`apps/media-portal/src/views/request-detail-view.tsx:15`) | `getMyMediaRequest(reference)` tracking view + withdraw (`request-detail-view.tsx:22-64`).                                                                                                                                                                    |
| anything else    | `NotFoundView`                                                                 | —                                                                                                                                                                                                                                                             |

The `:ref` extraction is `referenceFromPath`, matching `/^\/requests\/([^/]+)$/` and upper-casing
(`apps/media-portal/src/lib/router.ts:27-30`). The router is a History-API hook: `usePath`
subscribes to `popstate` (`router.ts:9-19`), `navigate` pushState + dispatches a synthetic
`popstate` (`router.ts:21-25`). No route params, no nested layouts, no outlet concept.

Header nav is a static array — `/`, `/request`, `/requests` (`apps/media-portal/src/components/site-header.tsx:18-22`).

Server side, only these SPA routes are served as HTML: the set `{ "/", "/request", "/requests" }`
plus `/requests/:ref` when the ref matches `MEDIA_REFERENCE_PATTERN`
(`apps/media-portal/server/auth.ts:20`, `auth.ts:117-122`). **A new route (e.g. `/feed`) must be
added to `SPA_ROUTES` too**, otherwise deep-links 404 in the dev/preview server.

### 1.2 Lifecycle and statuses (single source of truth: @voltedge/media-contract)

`MEDIA_REQUEST_STATUSES` = `submitted → analysing → awaiting_review | information_gap → approved | rejected | withdrawn` (`packages/media-contract/src/index.ts:23-31`), with the transition table at
`index.ts:57-65` (`approved`, `rejected`, `withdrawn` are terminal; `isOpenStatus` = non-terminal,
`index.ts:71-73`). Doc comment: "A request is never answered automatically: the AI draft always
lands in `awaiting_review`, and only a Staff/Admin approval moves it to `approved`" (`index.ts:15-22`).

**The approved/official response** is the pair of fields `approvedResponse` (string) and
`approvedSources` (`MediaDraftSource[]`, citations), set together by Staff/Admin approve:

- Contract view `MediaRequestPublic` carries `approvedResponse`, `approvedSources`, `approvedAt` (`packages/media-contract/src/index.ts:210-225`) — the requester-visible shape already exposes the approved response.
- Service writes them on approve: `apps/api/src/media/media.service.ts:376-387` (`approvedResponse: input.response`, `approvedSources: this.approvedSources(...)`, `approvedAt`, `approvedBy`, `closedAt`).
- DB columns `approved_response`, `approved_sources` (jsonb), `approved_at`, `approved_by` (`apps/auth/auth/db/schema.ts:111-114`; migration `apps/auth/auth/db/migrations/0002_sticky_ricochet.sql:34-37`).
- The AI draft (`aiDraft`/`draft`) is staff-only and "never shown to the requester as an answer" (`packages/media-contract/src/index.ts:196-207`).

### 1.3 Data model

`media_requests` table: `id`, unique `reference` (`media_requests_reference_unique`), `status` enum default `submitted`, `requester_name/email/id`, `outlet`, `claim`, `context`, `deadline`, AI draft columns, approved columns, `rejected_reason`, `assigned_to`, timestamps (`apps/auth/auth/db/schema.ts:93-126`). Indexes: status, requester_email, assigned_to (`schema.ts:121-125`; `0002_sticky_ricochet.sql:52-54`). **No index on `requester_id` and no index on `approved_at`/`approved_response` for feed-style queries.**

`media_request_events`: append-only audit with `seq` identity, `kind`, `visibility` enum
(`requester` | `internal`), FK cascade on request (`apps/auth/auth/db/schema.ts:131-149`). Owner
tracking filters events to `visibility === "requester"` (`apps/api/src/media/media.service.ts:563-573`).

Reference format `MEDIA-YYYY-XXXXXX` (`packages/media-contract/src/index.ts:101`), generated in
`media.service.ts:596-601` with 5 collision retries (`media.service.ts:576-594`).

## 2. Existing API surface (`media/requests`)

Controller: `apps/api/src/media/media.controller.ts:60` (`@Controller("media/requests")`). Auth:
global `AuthGuard` requires Bearer token unless optional/public (`apps/api/src/auth/auth.guard.ts:20-49`); `@Roles(...)` + `RolesGuard` enforce `Staff`/`Admin` (`apps/api/src/auth/roles.guard.ts:16-28`, decorator `apps/api/src/auth/roles.decorator.ts:7`). Roles come from `ROLES = ["Press", "Staff", "Admin"]` (`packages/auth-contract/src/index.ts:5`).

| Method | Path                                    | Roles                      | Request                                                                                                                   | Response                                                                          | Cite                                                                                       |
| ------ | --------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| POST   | `/media/requests`                       | any signed-in              | `submitMediaRequestSchema` (fullName, claim, context?, outlet?, deadline?) `packages/media-contract/src/index.ts:111-137` | `{ request: MediaRequestPublic }`                                                 | `media.controller.ts:65-70`                                                                |
| GET    | `/media/requests/mine`                  | any signed-in              | —                                                                                                                         | `{ requests: MediaRequestPublic[] }` (all of the user's, newest first, no params) | `media.controller.ts:72-75`; `media.service.ts:170-173`; SQL `media.repository.ts:225-233` |
| GET    | `/media/requests/mine/:reference`       | owner only (404 otherwise) | —                                                                                                                         | `{ request: MediaRequestTracking }` (Public + requester-visible events)           | `media.controller.ts:77-80`; `media.service.ts:175-181`, `563-573`                         |
| POST   | `/media/requests/:reference/withdraw`   | owner only                 | —                                                                                                                         | `{ request: MediaRequestPublic }` (status → withdrawn, only if `canTransition`)   | `media.controller.ts:82-86`; `media.service.ts:183-204`                                    |
| GET    | `/media/requests`                       | **Staff, Admin**           | `?status&assigned&q&limit&offset` (limit 1-100 def 25, offset 0-10 000)                                                   | `{ requests: MediaRequestStaff[], total }`                                        | `media.controller.ts:88-99`; response shape `media.service.ts:206-226`                     |
| GET    | `/media/requests/:reference`            | **Staff, Admin**           | —                                                                                                                         | `{ request: MediaRequestStaffDetail }` (email, assignment, AI draft, all events)  | `media.controller.ts:101-105`; `media.service.ts:228-233`                                  |
| PATCH  | `/media/requests/:reference`            | **Staff, Admin**           | `updateMediaRequestSchema` (status?, assignedTo?, note?) `packages/media-contract/src/index.ts:141-148`                   | `{ request: MediaRequestStaffDetail }`                                            | `media.controller.ts:107-117`                                                              |
| POST   | `/media/requests/:reference/approve`    | **Staff, Admin**           | `approveMediaRequestSchema` (response 10-10 000 chars, note?) `packages/media-contract/src/index.ts:150-161`              | `{ request: MediaRequestStaffDetail }`                                            | `media.controller.ts:119-129`                                                              |
| POST   | `/media/requests/:reference/reject`     | **Staff, Admin**           | `rejectMediaRequestSchema` (reason 5-2000) `packages/media-contract/src/index.ts:163-173`                                 | `{ request: MediaRequestStaffDetail }`                                            | `media.controller.ts:131-141`                                                              |
| POST   | `/media/requests/:reference/regenerate` | **Staff, Admin**           | —                                                                                                                         | `{ request: MediaRequestStaffDetail }`                                            | `media.controller.ts:143-148`                                                              |
| POST   | `/media/requests/:reference/notes`      | **Staff, Admin**           | `createMediaNoteSchema` (message, visibility) `packages/media-contract/src/index.ts:175-186`                              | `{ request: MediaRequestStaffDetail }`                                            | `media.controller.ts:150-160`                                                              |

Role coverage confirmed by e2e: a Press token gets **403** on `GET /media/requests` (`apps/api/test/media.e2e-spec.ts:154-158`) and 200 on `mine`/`mine/:ref`/`withdraw` (`media.e2e-spec.ts:132-152`).

**What Press can already call:** submit, list-own (`mine`), read-own tracking, withdraw. **Staff/Admin only:** queue list, any-request detail, PATCH, approve, reject, regenerate, notes.

## 3. Gaps vs the requested feature

1. **No feed of official/public responses.** The only list endpoint a Press user can call is `GET /media/requests/mine`, which returns _their own_ requests in all statuses (`media.controller.ts:72-75`, `media.service.ts:170-173`). It does include `approvedResponse`/`approvedSources` for their own approved requests (via `toPublicView`, `media.service.ts:62-79`), but there is **no endpoint listing approved responses across requests** — not even the user's own filtered to approved, and certainly not cross-requester "public/official responses". A new endpoint is required (the task's "is it buildable from `mine`?" answer: only the per-user approved subset is buildable from `mine`; a true feed is not).
2. **No sidebar/list-with-search for previous inquiries.** `GET /media/requests/mine` accepts **no query parameters at all** (`media.controller.ts:72-75`) — no `q`, `status`, `limit`, `offset`. Server-side search currently exists only on the staff queue: `q` → ILIKE over `reference, requester_name, requester_email, claim` (`apps/api/src/media/media.repository.ts:240-246`), consumed by `listForStaff` (`media.repository.ts:235-262`). `mine`'s SQL has no WHERE beyond `requester_id` and no LIMIT/OFFSET (`media.repository.ts:225-233`).
3. **No pagination on the Press side.** `MediaRequestPublic[]` is returned unbounded; only the staff list has `LIMIT/OFFSET` + `COUNT(*) OVER()` total (`media.repository.ts:249-256`).
4. **Update/delete mapping.** Create = `POST /media/requests` (exists). Read = `mine` + `mine/:ref` (exists, but unparameterised). Update = **none for Press** — only Staff/Admin `PATCH` (`media.controller.ts:107-117`); note the model has no editable-by-owner fields today (submission is immutable; the owner's only mutation is `withdraw`, which is the "delete" analogue — a soft close, not a hard delete; **no hard-delete endpoint exists anywhere**). A "draft inquiry" concept (editable before submit) does not exist in the model — "not found in sources".
5. **No frontend surface.** No feed view, no sidebar component, no search box in the media portal; nav is the static 3-item array (`site-header.tsx:18-22`) and the router has no layout-with-sidebar capability (`router.ts:9-30`). Any new route must also be registered in `SPA_ROUTES` (`apps/media-portal/server/auth.ts:20`).
6. **Indexing.** A feed query (`status = 'approved'` ordered by `approved_at`) is supported by `media_requests_status_idx` (`apps/auth/auth/db/schema.ts:122`) but there is no composite index for approved-ordered feed reads (`not found in sources` beyond the three indexes listed at `schema.ts:121-125`).

## 4. Proposed CRUD-bound design (PROPOSAL — not implemented)

### 4.1 Contract changes (`packages/media-contract/src/index.ts`)

- Add `MediaRequestSummary` (list item): `reference`, `status`, `claim` (or trimmed excerpt), `deadline`, `createdAt`, `hasResponse` (`approvedResponse !== null`).
- Add `MineQuerySchema` / params: `q?`, `status?`, `limit?` (1-100, default 50), `offset?`, and a `{ requests: MediaRequestSummary[], total: number }` list response (mirroring `MediaRequestListResponse` at `index.ts:258-261`).
- Add `MediaOfficialFeedItem`/`MediaOfficialFeedResponse`: reference, claim, `approvedResponse`, `approvedSources`, `approvedAt` — reuse `MediaDraftSource` (`index.ts:188-194`).

### 4.2 API changes (`apps/api/src/media`)

| Method | Path                                         | Roles                                                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/media/requests/mine?q&status&limit&offset` | signed-in (unchanged)                                                                          | Parameterise existing `mine`: extend `MediaController.mine` (`media.controller.ts:72-75`) to parse query params (reuse the `boundedInteger`/`optionalStatus` helpers at `media.controller.ts:37-58`), thread through a new repo query with `WHERE requester_id = $1 AND (claim ILIKE $q OR reference ILIKE $q) ORDER BY created_at DESC LIMIT/OFFSET` + `COUNT(*) OVER()` — pattern copied from `listForStaff` (`media.repository.ts:235-262`). Response stays `{ requests: MediaRequestSummary[], total }`. |
| GET    | `/media/requests/feed`                       | signed-in (Press included); optionally `@Public()` if the feed should be browsable pre-sign-in | New service method `listOfficialResponses()`; new repo query `WHERE status = 'approved' ORDER BY approved_at DESC LIMIT/OFFSET` selecting only `reference, claim, approved_response, approved_sources, approved_at` — **never** `ai_draft`, `requester_email`, `requester_id` or internal event data. Route must be declared **before** `@Get(":reference")` (`media.controller.ts:101`) or NestJS will match `feed` as a reference.                                                                         |

No write endpoints are needed: create = submit (`media.controller.ts:65`), read = `mine`/`mine/:ref` + new feed, update = not applicable for Press today (open question 4), delete = withdraw (`media.controller.ts:82`).

### 4.3 media-ui changes (`packages/media-ui/src/api.ts`)

Add `listMyMediaRequests(params)` overload and `listOfficialResponses(params)` following the exact `request<T>()` + `ApiError` conventions of `packages/media-ui/src/api.ts:32-52, 84-91`. Export a `RequestSidebar`-style list component reusing `StatusBadge` and `deadlinePhrase` (as `MyRequestsView` already does, `apps/media-portal/src/views/my-requests-view.tsx:140-165`).

### 4.4 Frontend (apps/media-portal)

- New `FeedView` at `/` (or `/feed`): two-column layout, feed column + sidebar.
- New `RequestsSidebar` component: "Create new" button → `navigate("/request")` (`lib/router.ts:21`); search input (debounced, server-side via parameterised `mine`); list of summaries linking to `/requests/:ref`.
- Keep `MyRequestsView` reachable (e.g. from the sidebar) or fold it into the feed layout.
- Register any new path in `SPA_ROUTES` (`server/auth.ts:20`).
- Data fetching stays plain `useEffect` + `fetch`-style promises (existing convention: `home-view.tsx:121-136`, `my-requests-view.tsx:40-50` with 5 s polling while active; **no React Router, no TanStack Query** — `apps/media-portal/package.json:11-21` declares only react, react-dom, valibot, lucide-react and workspace packages).

### 4.5 Layout sketch

```
┌────────────────────────────────────────────────────────────────┐
│ SiteHeader (nav: Media room · File a request · My requests)    │
├──────────────┬─────────────────────────────────────────────────┤
│ SIDEBAR      │  FEED (official responses)                      │
│ ┌──────────┐ │ ┌─────────────────────────────────────────────┐ │
│ │[+ Create │ │ │ MEDIA-2026-ABC123  [Approved]  approved 3d  │ │
│ │  new]    │ │ │ "Is headline inflation 2% in July?"         │ │
│ ├──────────┤ │ │ Approved response text + references (3)     │ │
│ │[search…] │ │ ├─────────────────────────────────────────────┤ │
│ ├──────────┤ │ │ MEDIA-2026-XYZ789  [Approved]  approved 1w  │ │
│ │ my ref 1 │ │ │ …                                           │ │
│ │ my ref 2 │ │ └─────────────────────────────────────────────┘ │
│ │ my ref 3 │ │  (click a sidebar item → /requests/:ref detail) │
│ └──────────┘ │                                                 │
└──────────────┴─────────────────────────────────────────────────┘
```

## 5. Open questions / decisions for the user

1. **Feed scope**: global (all requesters' approved responses, i.e. semi-public to any signed-in user) or per-user only? The code separates "requester-visible" from "internal" event visibility (`packages/media-contract/src/index.ts:96-99`) but has no concept of cross-user visibility — a global feed is a new access model.
2. **Does "official response" mean status `approved` only?** (Recommended: yes — `approvedResponse` is only ever populated by the approve action, `media.service.ts:376-387`.)
3. **Should the feed be anonymous** (`@Public()` decorator exists: `apps/api/src/auth/public.decorator.ts`) or signed-in-only? Note `AuthGuard` requires a token by default (`auth.guard.ts:34-37`).
4. **Is "update" actually needed for Press?** Submitted requests are immutable today; if the feature means editable drafts before submit, that is a new status + endpoints (not found in sources). Or is the intended "update" just the existing withdraw?
5. **Search scope**: client-side filter of `mine` is simplest, but server-side `q` on `mine` (proposed above) matches the staff-queue pattern (`media.repository.ts:240-246`).
6. **Pagination defaults** for `mine` and the feed (staff queue defaults: limit 25, max 100 — `media.controller.ts:95-96`).
7. **POPIA / security note (what the code does today, not policy advice)**: approved responses currently reach only the owning requester via `MediaRequestPublic` (`media.service.ts:62-79`) and the sign-in gate states "Approved responses and their references are private to the account that filed the request" (`apps/media-portal/src/views/request-detail-view.tsx:76-79`). The home page also promises "Requests and drafts are visible only to you and the Stats SA reviewers working on your query" (`apps/media-portal/src/views/home-view.tsx:53-56`). A cross-requester feed contradicts these on-screen commitments and would expose requester names/claims (`MediaRequestPublic` includes `requesterName`, `claim`, `outlet` — `packages/media-contract/src/index.ts:210-225`) to other Press users; a `popia-contract`/`popia-ui` package exists for privacy workflows (`apps/auth/auth/db/schema.ts:36-61`), so the privacy decision should be made consciously.

## 6. Sources

### Repo files (read in full or targeted)

- `apps/media-portal/src/App.tsx`, `src/lib/router.ts`, `src/lib/session.tsx`
- `apps/media-portal/src/views/home-view.tsx`, `request-view.tsx`, `my-requests-view.tsx`, `request-detail-view.tsx`
- `apps/media-portal/src/components/site-header.tsx`
- `apps/media-portal/server/auth.ts`, `server/env.ts`, `vite.config.ts`, `package.json`
- `packages/media-contract/src/index.ts`, `README.md`
- `packages/media-ui/src/api.ts`, `src/components/request-file.tsx`, `README.md`
- `packages/auth-contract/src/index.ts`
- `apps/api/src/media/media.controller.ts`, `media.service.ts`, `media.repository.ts`, `media.module.ts`
- `apps/api/src/auth/auth.guard.ts`, `roles.guard.ts`, `roles.decorator.ts`, `current-user.decorator.ts`
- `apps/api/test/media.e2e-spec.ts`
- `apps/auth/auth/db/schema.ts`, `apps/auth/auth/db/migrations/0002_sticky_ricochet.sql`
- `apps/control-centre/src/views/media-queue-view.tsx`

### First-party URLs

- Not required in this note: all facts above are repo-internal. The auth library is `@openauthjs/openauth` (`apps/media-portal/package.json:12`, `apps/media-portal/server/auth.ts:2`), whose behaviour here (client verify/exchange, subject schema) is cited from the in-repo usage at `apps/media-portal/server/auth.ts:148-238` and `packages/auth-contract/src/index.ts:20-27`.
