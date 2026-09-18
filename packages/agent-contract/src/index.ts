/**
 * The single source of truth for the Rafiki agent contract.
 *
 * `apps/api` (agent/runtime), `@voltedge/ai-chat` (chat surface) and any other
 * consumer share these shapes so the SSE protocol, UI blocks and telemetry
 * spans cannot drift.
 */

/* -------------------------------------------------------------------------- */
/* Chat transport                                                             */
/* -------------------------------------------------------------------------- */

/** Request body for the chat SSE endpoint. */
export interface ChatRequest {
  sessionId: string;
  message: string;
}

/**
 * One `data:` frame on the chat SSE stream.
 *
 * Ordering and terminal guarantees: a run ends with exactly one `done`; `error`
 * may appear before it. `ui` blocks are emitted just before the matching
 * `tool_end` so a client can pair them by `toolCallId`.
 */
export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; name: string; args: unknown; toolCallId: string }
  | {
      type: "tool_end";
      name: string;
      isError: boolean;
      summary: string;
      toolCallId: string;
      details?: unknown;
    }
  | { type: "ui"; block: UiBlock; toolCallId: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** Provider and model status reported by the agent API. */
export interface AgentStatus {
  provider: string;
  label: string;
  envKey: string;
  hasEnvKey: boolean;
  model: string;
  toolCount: number;
}

/* -------------------------------------------------------------------------- */
/* Typed UI blocks                                                            */
/* -------------------------------------------------------------------------- */

export interface SourceItem {
  chunkId: number;
  source: string;
  title: string | null;
  snippet: string;
  score?: number;
}

export type UiBlock =
  | {
      component: "table";
      title?: string;
      columns: string[];
      rows: (string | number)[][];
      source?: string;
    }
  | {
      component: "chart";
      kind: "line" | "bar";
      title?: string;
      xLabel?: string;
      yLabel?: string;
      categories: string[];
      series: { name: string; values: number[] }[];
      source?: string;
    }
  | { component: "sources"; title?: string; items: SourceItem[] }
  | { component: "document"; source: string; title: string | null; text: string };

export const UI_COMPONENTS = ["table", "chart", "sources", "document"] as const;

export type UiComponent = (typeof UI_COMPONENTS)[number];

export function isUiComponent(value: unknown): value is UiComponent {
  return typeof value === "string" && (UI_COMPONENTS as readonly string[]).includes(value);
}

/**
 * Discriminant guard for untrusted payloads. Structural validation of a block's
 * props belongs to the producer; renderers treat unknown components as absent.
 */
export function isUiBlock(value: unknown): value is UiBlock {
  if (!value || typeof value !== "object") return false;
  return isUiComponent((value as { component?: unknown }).component);
}

/* -------------------------------------------------------------------------- */
/* Telemetry                                                                  */
/* -------------------------------------------------------------------------- */

export type SpanStatus = "ok" | "error";

export interface RecordedTelemetryEvent {
  name: string;
  attributes: Record<string, unknown>;
  timestamp: number;
}

/** A settled or in-flight span as returned by the telemetry stream. */
export interface RecordedSpan {
  id: number;
  parentId: number | null;
  name: string;
  attributes: Record<string, unknown>;
  events: RecordedTelemetryEvent[];
  status: SpanStatus;
  errorMessage?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  settled: boolean;
}

export type TelemetryStoreEvent = { type: "span"; span: RecordedSpan } | { type: "clear" };

/** Client-side aggregation of `pi.ai.request` spans. */
export interface TelemetrySummary {
  requests: number;
  tools: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  avgMs: number;
}

/* -------------------------------------------------------------------------- */
/* Retrieval                                                                  */
/* -------------------------------------------------------------------------- */

export interface IndexedDocument {
  source: string;
  title: string | null;
  text: string;
}

/* -------------------------------------------------------------------------- */
/* Chat surface state                                                          */
/* -------------------------------------------------------------------------- */

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export interface ToolRun {
  id: string;
  name: string;
  args: unknown;
  summary: string;
  state: "running" | "done" | "error";
  details?: unknown;
  hasBlock?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking: string;
  tools: ToolRun[];
  blocks: UiBlock[];
  error?: string;
}
