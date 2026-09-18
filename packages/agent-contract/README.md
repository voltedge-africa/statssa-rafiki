# @voltedge/agent-contract

The single source of truth for the Rafiki agent contract:

- `ChatRequest` / `ChatEvent` / `AgentStatus` — the SSE chat protocol.
- `UiBlock` / `SourceItem` / `isUiBlock` — typed generative-UI blocks.
- `RecordedSpan` / `TelemetryStoreEvent` / `TelemetrySummary` — telemetry contract.
- `IndexedDocument` — the RAG document shape.
- `ChatMessage` / `ToolRun` / `ChatStatus` — chat-surface state.

`apps/api` (agent runtime) and `@voltedge/ai-chat` (chat surface) both consume this
package so the protocol cannot drift.

## Build

```bash
vp run @voltedge/agent-contract#build
```
