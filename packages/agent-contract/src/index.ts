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
  | { type: "verification"; status: VerificationStatus; unverified: string[] }
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
  /** Stable, globally-unique id for this span; survives process restarts. */
  uid: string;
  parentId: number | null;
  /** Stable id of the parent span, or null for a root span. */
  parentUid: string | null;
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

/**
 * Governance vocabulary for the persisted AI telemetry (`ai_spans`).
 *
 * These shapes are intentionally free of prompt, completion and tool-output
 * content: the pipeline only records what the model did, which tools it used,
 * and how the call performed.
 */

/** Coarse classification of a recorded span. */
export type AiSpanKind = "turn" | "model_request" | "tool" | "other";

/** One persisted `pi.ai.request` span, flattened for governance queries. */
export interface AiModelCall {
  spanUid: string;
  parentUid: string | null;
  sessionId: string | null;
  feature: string | null;
  clientRole: string | null;
  clientOrigin: string | null;
  provider: string | null;
  model: string | null;
  responseModel: string | null;
  operation: string | null;
  stopReason: string | null;
  status: SpanStatus;
  errorMessage: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  chunkCount: number | null;
  timeToFirstChunkMs: number | null;
  durationMs: number | null;
  startedAt: string;
  endedAt: string | null;
}

/** One persisted tool-execution span, flattened for governance queries. */
export interface AiToolCall {
  spanUid: string;
  parentUid: string | null;
  sessionId: string | null;
  feature: string | null;
  clientRole: string | null;
  toolName: string | null;
  toolCallId: string | null;
  toolIsError: boolean | null;
  status: SpanStatus;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  endedAt: string | null;
}

/** One persisted span as returned by the session trace view. */
export interface AiSessionSpan {
  spanUid: string;
  parentUid: string | null;
  sessionId: string | null;
  name: string;
  kind: AiSpanKind;
  feature: string | null;
  clientRole: string | null;
  provider: string | null;
  model: string | null;
  operation: string | null;
  toolName: string | null;
  toolCallId: string | null;
  toolIsError: boolean | null;
  status: SpanStatus;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  endedAt: string | null;
  attributes: Record<string, unknown>;
  events: unknown[];
}

/** Paginated governance rows plus the total matching the filters. */
export interface AiPage<T> {
  items: T[];
  total: number;
}

/** Filters accepted by the admin AI telemetry endpoints. */
export interface AiUsageFilters {
  /** Inclusive ISO date-time lower bound on `started_at`. */
  from?: string;
  /** Exclusive ISO date-time upper bound on `started_at`. */
  to?: string;
  model?: string;
  feature?: string;
  role?: string;
  tool?: string;
  sessionId?: string;
}

/** Aggregate rollup over model-request spans. */
export interface AiUsageTotals {
  requests: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  avgDurationMs: number;
  errorCount: number;
}

/** A single named bucket in a usage rollup. */
export interface AiUsageBucket extends AiUsageTotals {
  key: string;
}

/** Governance rollup returned by `GET /admin/ai/usage`. */
export interface AiUsageSummary {
  totals: AiUsageTotals;
  byModel: AiUsageBucket[];
  byTool: AiUsageBucket[];
  byFeature: AiUsageBucket[];
  byRole: AiUsageBucket[];
  byDay: AiUsageBucket[];
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

/** Result of the deterministic post-turn number check. */
export type VerificationStatus = "verified" | "unverified" | "skipped";

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
  /** Set from the post-turn `verification` event, when one is emitted. */
  verification?: { status: VerificationStatus; unverified: string[] };
}
