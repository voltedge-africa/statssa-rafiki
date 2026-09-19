# Public portal demo prompts: three deterministic sets for the GHS 2025 corpus

Curated empty-state prompts for the public portal (`apps/public-portal/src/main.tsx`), replacing the
retired CPI trio with nine prompts that exercise every route of the GHS 2025 corpus. Each prompt is
deterministic: the answer appears verbatim in an indexed source, and the wording forces one pipeline,
so a demo reproduces the same tool calls and the same figures every time.

- Date: 2026-09-19
- Status: implemented and spot-checked live on this branch (2026-09-19);
  `apps/public-portal/src/main.tsx` is the UI source of truth.

## 1. Corpus snapshot

- Documents: [`ghs-2025-media-release.md`](../../apps/api/corpus/ghs-2025-media-release.md),
  [`ghs-2025-presentation.md`](../../apps/api/corpus/ghs-2025-presentation.md) and
  [`ghs-2025-statistical-release.md`](../../apps/api/corpus/ghs-2025-statistical-release.md).
- Fact tables: `household_assets`, `internet_access_by_province`, `response_rates_by_province` and
  `higher_education_population_group` under [`apps/api/fact_store`](../../apps/api/fact_store), each
  described in `table_descriptions.csv`.
- Routing: the system prompt (`apps/api/src/agent/agent.service.ts:24-56`) sends narrative and
  methodology questions to `search_statssa` (hybrid keyword + vector) and number questions to
  `list_fact_tables` → `query_factstore` (read-only SQL). `show_table`, `show_chart` and
  `show_document` (`apps/api/src/agent/ui/tools.ts:16-62`) render the visual blocks.
- Trust layer: the number verifier (`apps/api/src/agent/verifier.ts:89`) checks every figure in the
  answer against tool ground truth, and an out-of-corpus answer must be the exact
  `REFUSAL_ANSWER` string (`apps/api/src/agent/agent.service.ts:21-22`), mandated by the prompt at
  `apps/api/src/agent/agent.service.ts:44-45`.

## 2. The three sets

Ordered as they appear in `SUGGESTIONS`; the portal renders all nine as chips.

### Set A — Fact store (exact figures, tables, charts)

| #   | Prompt                                                                     | Route                                                         | Verbatim anchor                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Show a table of household asset ownership by rural, urban and metro, 2025. | `query_factstore(household_assets)` + `show_table`            | Refrigerator 73,5 rural vs 85,0 urban; Electric Stove 88,3 national (`apps/api/corpus/ghs-2025-statistical-release.md:4840-4849`, CSV `apps/api/fact_store/household_assets.csv`)       |
| A2  | Chart the share of households with any internet access by province, 2025.  | `query_factstore(internet_access_by_province)` + `show_chart` | Any kind of access: WC 93,8; EC 74,5; RSA 85,6 (`ghs-2025-statistical-release.md:4015-4018`, CSV row "Any kind of access")                                                              |
| A3  | Compare the GHS 2025 response rate in Limpopo with the national rate.      | `query_factstore(response_rates_by_province)`                 | Limpopo 96,97 vs South Africa 85,16 (`apps/api/fact_store/response_rates_by_province.csv`; the release prose rounds these to 97,0% and 85,2% at `ghs-2025-statistical-release.md:5018`) |

### Set B — Text corpus (narrative, methodology)

| #   | Prompt                                                    | Route            | Verbatim anchor                                                                                                                                        |
| --- | --------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | How has access to improved sanitation changed since 2002? | `search_statssa` | 61,7% in 2002 to 84,0% in 2025; Eastern Cape +54,6 pp; Limpopo +37,9 pp (`ghs-2025-media-release.md:10-16`)                                            |
| B2  | How are the GHS 2025 survey weights calibrated?           | `search_statssa` | Design weights, regression estimation to national/provincial controls, StatMx (`ghs-2025-statistical-release.md:5927-5946`)                            |
| B3  | What does the GHS 2025 report say about food inadequacy?  | `search_statssa` | 22,0% national; Northern Cape 43,0%; Limpopo 6,1% (`ghs-2025-statistical-release.md:4725-4727`); 4,2 pp above 2019 (`ghs-2025-media-release.md:57-58`) |

### Set C — Trust and tools

| #   | Prompt                                                                      | Route                                        | Verbatim anchor                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Open the GHS 2025 media release.                                            | `show_document("ghs-2025-media-release.md")` | Exact source path; preview reads the indexed document text (`apps/api/src/agent/ui/tools.ts:40-62`)                                                                              |
| C2  | Calculate the urban-rural refuse removal gap in the GHS 2025 media release. | `search_statssa` + `calculate`               | Urban 84,9%; rural 13,0% (`ghs-2025-media-release.md:20-23`); the gap 71,9 comes from `calculate`, so the verifier marks it verified (`apps/api/src/agent/verifier.ts:76-79`)    |
| C3  | What was South Africa's GDP growth rate in 2025?                            | `search_statssa` → refusal                   | GDP is absent from the corpus; the answer must be exactly `The provided Stats SA documentation does not contain this information.` (`apps/api/src/agent/agent.service.ts:44-45`) |

## 3. Why these are deterministic

- **Figures are verbatim.** Every number the model reports exists in a passage or fact row, so the
  verifier has ground truth and the "Numbers verified against sources" badge appears.
- **Wording forces the route.** "Show a table" and "Chart" select the visual tools; "any internet
  access" pins the single `Any kind of access` row instead of all eight access types; "Calculate"
  selects the calculator instead of an unverified mental sum.
- **The refusal is exact.** C3 asks about a same-agency statistic (GDP, a different publication), so
  it exercises the negative-rejection path rather than failing retrieval for an obviously unrelated
  question.
- **Calculations need prose operands.** C2 names the media release so retrieval returns the two
  figures in prose (`ghs-2025-media-release.md:20-23`) and the subtraction is exact (84,9 − 13,0 =
  71,9). Table-only sources are a trap: the verifier's number tokeniser merges whitespace-separated
  cells ("13,0 6,2 77,7"), and decimal arithmetic can carry binary noise (90,6 − 76,7 =
  13,899999999999991), so those operands would show as unverified even when the answer is right.

## 4. Suggested demo flow

- Full sweep: run Set A, then B, then C — structured data, then retrieval, then the trust layer.
- Short version: A2 (chart), B1 (trend with citations), C3 (refusal).
- The chips are plain strings passed to `ChatSurface` (`apps/public-portal/src/main.tsx`); the layout
  wraps them in the empty state (`packages/ai-chat/src/components/chat-surface.tsx:167-176`). The
  shared `DEFAULT_SUGGESTIONS` are left as-is because the portal always overrides them.
- Keep each prompt under roughly 80 characters. A chip is a single flex item, so a much longer
  string overflows the row rather than wrapping (the first C2 draft did exactly that).

## 5. Maintenance

When the corpus or fact store changes, re-verify the anchors above before shipping the prompts: the
chip list and this note are the only things that would otherwise go stale silently. The 2025 anchors
can be re-checked with a search over `apps/api/corpus` and `apps/api/fact_store`.
