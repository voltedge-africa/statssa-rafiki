# Control-centre coverage of the Rafiki challenge requirements

A capability map of the existing Rafiki monorepo against the consolidated hackathon
requirement list, and the smallest control-centre additions that move the highest-weight
criteria — written to answer "what can we put in the control-centre now", not "what could
we rebuild".

- Date: 2026-09-19
- Status: research / draft — the viable bundle has been partially implemented (see §4).

Docs convention: this repo has one research note (`docs/research/media-portal-inquiry-feed.md`);
this file follows it, citing claims as `path:LINE` and grouping sources at the end.

## Scope & method

Read the source, not the summaries: contract packages, API controllers/services, the four
frontends, the auth issuer, and the migrations. Every row below is backed by a file that
either implements the requirement or proves it is absent. No requirement was taken from
`README.md` alone.

## 1. Requirement coverage at a glance

| #            | Requirement                                            | Status                              | Evidence                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-01        | Public NL search, grounded answers                     | **Done**                            | `apps/public-portal/src/main.tsx:10` renders `ChatSurface`; `POST /api/chat` is `@OptionalAuth` (`apps/api/src/agent/agent.controller.ts:38`); corpus-only prompt (`apps/api/src/agent/agent.service.ts:18`) |
| FR-01b       | Tiered Public Summary + Media Brief from one retrieval | **Missing**                         | one draft shape only (`packages/media-contract/src/index.ts:208`)                                                                                                                                            |
| FR-03        | Dedicated media submission portal                      | **Done**                            | `apps/media-portal` submit/track/withdraw/feed                                                                                                                                                               |
| FR-04        | Structured Media Brief + house-style templates         | **Partial**                         | grounded draft exists (`apps/api/src/media/media-draft.service.ts:86`); no Findings Release / Media Advisory templates in any contract                                                                       |
| FR-08        | Searchable communication memory                        | **Partial**                         | approved-response feed (`apps/api/src/media/media.service.ts:216`); no cross-search over prior answers                                                                                                       |
| FR-10        | Human-in-the-loop approval                             | **Done**                            | approve/reject/regenerate endpoints; `apps/control-centre/src/views/media-request-view.tsx`                                                                                                                  |
| FR-05        | RAG confidence drives escalation                       | **Partial → strengthened**          | per-chunk `similarity` computed (`apps/api/src/agent/rag/db.ts:22`), now carried into drafts and gated                                                                                                       |
| FR-07/BR-10  | Admin Knowledge Base management                        | **Missing**                         | CLI ingest only (`apps/api/src/agent/rag/ingest.ts`); read-only `GET /api/rag/document`                                                                                                                      |
| BR-12        | Searchable/filterable audit trail                      | **Missing**                         | events exist per request (`media_request_events`, `popia_request_events`) but no cross-request reader                                                                                                        |
| FR-09/BR-08  | Response reuse recommendation                          | **Missing**                         | no similarity lookup over approved answers                                                                                                                                                                   |
| —            | Automated post-generation enforcement gate             | **Missing → implemented**           | new `reviewDraft` gate (§4)                                                                                                                                                                                  |
| FR-02/BR-03  | Mandatory multi-citation grounding                     | **Done**                            | `extractCitationIds` (`packages/media-contract/src/index.ts:327`)                                                                                                                                            |
| FR-06        | Information-gap flagging, no silent failure            | **Done**                            | `information_gap` status + `aiGap` message (`apps/api/src/media/media.service.ts:550`)                                                                                                                       |
| FR-12        | Intelligent document analysis for comms                | **Partial**                         | `DocumentPreview` opens a cited passage (`packages/ai-chat/src/components/document-preview.tsx`)                                                                                                             |
| NFR-02       | Web deployment, widget/chat/API                        | **Done**                            | public portal + API; no embeddable widget yet                                                                                                                                                                |
| BR-01/BR-04  | Hard lock on publish                                   | **Done**                            | only the approve endpoint transitions to `approved`                                                                                                                                                          |
| BR-11/NFR-03 | RBAC across Public/Media/Comms/Admin                   | **Done**                            | `@Roles`/`RolesGuard` (`apps/api/src/auth/roles.guard.ts`), proxy gating per app                                                                                                                             |
| NFR-07       | WCAG across portals                                    | **Unverified**                      | Storybook a11y addon exists (`apps/storybook/.storybook/main.ts`); no audit done                                                                                                                             |
| FR-16        | English/isiZulu toggle                                 | **Missing**                         | output language hardcoded (`apps/api/src/media/media-draft.service.ts:21`); the embedding model is multilingual                                                                                              |
| —            | Governance framework / kill switch                     | **Missing → governance page added** | documented controls page (§4); no live kill switch                                                                                                                                                           |

Summary: criteria 1 and 2 are largely **already built**; the cheap, demo-visible gaps are
confidence enforcement, a governance screen, an audit console, reuse and the KB panel.

## 2. What the control centre already surfaces

- POPIA case queue + case file with tabs (`apps/control-centre/src/views/case-queue-view.tsx`,
  `case-request-view.tsx`).
- Media fact-check queue + review/approve workspace (`media-queue-view.tsx`,
  `media-request-view.tsx`).
- AI governance telemetry: usage, model calls, tool calls, session trace
  (`ai-telemetry-view.tsx`; `GET /admin/ai/*` in `apps/api/src/admin/ai-telemetry.controller.ts:52`).
- Server-side proxy injects the bearer token and gates by role
  (`apps/control-centre/server/auth.ts:25`, `:309`).

Everything below was chosen because it rides on that existing surface and data.

## 3. Gaps worth closing first (ordered by score-per-hour)

1. **Enforcement gate + confidence** — the innovation differentiator, and the retrieval
   signal already exists.
2. **Governance framework as a page** — criterion 6 points for near-zero build; the controls
   already exist and only needed stating.
3. **Audit Trail viewer** — BR-12; a single read-only cross-request list over data that is
   already append-only by application convention.
4. **Response Reuse** — FR-09; embed the incoming claim and search prior approved answers
   (pgvector is already in the same Postgres).
5. **KB management panel** — FR-07/BR-10; start read-only (list + reindex), add
   current/superseded only if the judge flow needs it.

## 4. Implemented in this change

- **Draft confidence** — `draftConfidence` takes the weakest recorded passage similarity, so
  one weak citation cannot hide behind strong ones. Carried from `RagHit.similarity` through
  `toSource` into `MediaAiDraft.confidence`; shown as a badge on the shared `DraftCard`.
  (`packages/media-contract/src/index.ts`; `apps/api/src/media/media-draft.service.ts:34`;
  `apps/api/src/media/media.service.ts:99`; `packages/media-ui/src/components/draft-card.tsx`.)
- **Post-generation enforcement gate** — `reviewDraft` returns five checks: grounded, cited,
  valid-citations, fully-cited (advisory) and confidence. Gate failures disable
  "Approve and release" for AI-derived responses; manual replies stay with the official.
  (`packages/media-contract/src/index.ts`; `apps/control-centre/src/views/media-request-view.tsx`.)
- **Governance page** — `/governance` under the AI Governance sidebar group: live usage,
  escalation-rate insight, capability allowlist, observed models, and the controls enforced
  in the pipeline. (`apps/control-centre/src/views/governance-view.tsx`,
  `components/app-sidebar.tsx`, `src/App.tsx`.)
- **Operable governance settings** — the page is an admin control surface, not a report. One
  persisted singleton (`governance_settings`, migration `0006`) backs four live controls via
  `GET/PATCH /admin/governance`:
  - the **confidence floor** is read by `MediaDraftService` (escalates weak retrieval to an
    information gap) and by the desk gate via `GET /media/requests/policy`;
  - the **tool allowlist** filters the agent's registry when a session is built;
  - **generation** is a kill switch: chat answers on the SSE channel with a disabled message
    and media drafting parks as an information gap;
  - **policies** and **incident response** are maintained, persisted copy.
    (`apps/api/src/admin/governance.{defaults,repository,service,controller,module}.ts`,
    `packages/agent-contract/src/index.ts`, `apps/auth/auth/db/schema.ts`.)
- Tests: contract gate/confidence behaviour (`packages/media-contract/tests/index.test.ts`),
  the governance update schema (`packages/agent-contract/tests/index.test.ts`), draft
  escalation (`apps/api/src/media/media-draft.service.spec.ts`) and similarity carry-through.

Deliberately **not** built here: two-tier brief, templates, isiZulu, KB upload, audit
console, response reuse.

## 5. Open questions

- Does the demo need the audit console to be cross-request, or is a per-case timeline
  acceptable? A per-case view already exists; a cross-request one needs a new admin endpoint.
- Should the enforcement gate hard-block, or flag and require a written override? Hard-block
  is more defensible for responsible-AI scoring, but uncited-sentence detection is heuristic.
- Which two house-style templates are authoritative, and do they differ structurally or only
  in tone? This decides whether templates are a prompt change or a contract change.
- FR-02 says "multi-citation"; the gate currently requires at least one citation. Whether to
  require a minimum count (and block otherwise) is a product call, since some grounded answers
  legitimately rest on a single release.

## 6. Sources

- `packages/media-contract/src/index.ts` — statuses, events, DTOs, `extractCitationIds`; new `draftConfidence`/`reviewDraft`.
- `packages/agent-contract/src/index.ts` — chat events, telemetry and governance shapes.
- `packages/auth-contract/src/index.ts` — roles, shared cookies, `workspaceForRole`.
- `apps/api/src/media/media-draft.service.ts`, `media.service.ts`, `media.controller.ts` — draft generation, lifecycle, role-gated endpoints.
- `apps/api/src/agent/rag/{db.ts,retrieve.ts,tool.ts,config.ts}` — hybrid retrieval, `similarity`, relevance gates.
- `apps/api/src/agent/agent.controller.ts`, `agent.service.ts` — public chat, corpus-only prompt.
- `apps/api/src/admin/ai-telemetry.controller.ts`, `apps/auth/auth/db/schema.ts` — persisted governance telemetry (`ai_spans`).
- `apps/control-centre/{src/App.tsx,src/components/app-sidebar.tsx,src/views/*,server/auth.ts}` — control-centre surfaces and proxy gating.
- `apps/public-portal/src/main.tsx`, `apps/media-portal/src/**`, `apps/website/src/**` — sibling frontends.
- `docs/research/media-portal-inquiry-feed.md` — the repo's existing research-note convention.
