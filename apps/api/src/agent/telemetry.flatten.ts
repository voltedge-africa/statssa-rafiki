import type { AiSpanKind, RecordedSpan, RecordedTelemetryEvent } from "@voltedge/agent-contract";

/**
 * Attribute keys owned by the Rafiki instrumentation. Everything else on a span
 * comes from pi and is stored as-is (after sanitisation).
 */
export const TELEMETRY_ATTR = {
  session: "session.id",
  feature: "rafiki.feature",
  clientRole: "rafiki.client.role",
  clientOrigin: "rafiki.client.origin",
} as const;

/**
 * A row for `ai_spans`. Keys are the exact snake_case column names so the
 * postgres.js dynamic-insert helper can bind them directly.
 */
export interface AiSpanWrite {
  span_uid: string;
  parent_uid: string | null;
  session_id: string | null;
  name: string;
  kind: AiSpanKind;
  feature: string | null;
  client_role: string | null;
  client_origin: string | null;
  provider: string | null;
  model: string | null;
  response_model: string | null;
  operation: string | null;
  tool_name: string | null;
  tool_call_id: string | null;
  tool_is_error: boolean | null;
  stop_reason: string | null;
  status: "ok" | "error";
  error_message: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  cost_usd: string | null;
  chunk_count: number | null;
  time_to_first_chunk_ms: number | null;
  duration_ms: number | null;
  started_at: string;
  ended_at: string | null;
  attributes: string;
  events: string;
}

/**
 * Keys that could carry prompt, completion, tool-argument or tool-output content.
 * Matched on `.`/`[` namespaces so `pi.ai.usage.output_tokens` is kept while
 * `tool.args`, `pi.ai.payload` and free-form `*.content` are dropped. A segment
 * is only sensitive when it is the whole name between separators, never a prefix
 * like `output_tokens`. This is defence in depth: the instrumentation already
 * emits no content.
 */
const SENSITIVE_SEGMENT =
  /(^|\.)(prompt|prompts|completion|completions|message|messages|content|text|delta|args|arguments|result|output|payload|body)(\.|$)/i;

export function isSensitiveAttribute(key: string): boolean {
  return SENSITIVE_SEGMENT.test(key);
}

type Attributes = Record<string, unknown>;

/** Drop content-bearing attributes; keep the rest (numbers, strings, booleans, arrays). */
export function sanitizeAttributes(attributes: Attributes): Attributes {
  const clean: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (isSensitiveAttribute(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export function sanitizeEvents(events: RecordedTelemetryEvent[]): RecordedTelemetryEvent[] {
  return events.map((event) => ({
    name: event.name,
    attributes: sanitizeAttributes(event.attributes),
    timestamp: event.timestamp,
  }));
}

/** Coarse classification used by the governance views and admin filters. */
export function spanKind(name: string): AiSpanKind {
  if (name === "pi.ai.request") return "model_request";
  if (name === "rafiki.tool") return "tool";
  if (name === "rafiki.turn" || name === "rafiki.completion") return "turn";
  return "other";
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function iso(epochMs: number | undefined): string | null {
  return epochMs === undefined ? null : new Date(epochMs).toISOString();
}

/** Flatten a settled pi span into a persisted `ai_spans` row. */
export function toAiSpanWrite(span: RecordedSpan): AiSpanWrite {
  const attributes = sanitizeAttributes(span.attributes);
  const cost = asNumber(attributes["pi.ai.usage.cost"]);
  const endedAt = iso(span.endedAt);

  return {
    span_uid: span.uid,
    parent_uid: span.parentUid,
    session_id: asString(attributes[TELEMETRY_ATTR.session]),
    name: span.name,
    kind: spanKind(span.name),
    feature: asString(attributes[TELEMETRY_ATTR.feature]),
    client_role: asString(attributes[TELEMETRY_ATTR.clientRole]),
    client_origin: asString(attributes[TELEMETRY_ATTR.clientOrigin]),
    provider: asString(attributes["pi.ai.provider"]),
    model: asString(attributes["pi.ai.model"]),
    response_model: asString(attributes["pi.ai.response.model"]),
    operation: asString(attributes["pi.ai.operation"]),
    tool_name: asString(attributes["tool.name"]),
    tool_call_id: asString(attributes["tool.call_id"]),
    tool_is_error: asBoolean(attributes["tool.is_error"]),
    stop_reason: asString(attributes["pi.ai.response.stop_reason"]),
    status: span.status,
    error_message: span.errorMessage ?? null,
    input_tokens: asNumber(attributes["pi.ai.usage.input_tokens"]),
    output_tokens: asNumber(attributes["pi.ai.usage.output_tokens"]),
    cache_read_tokens: asNumber(attributes["pi.ai.usage.cache_read_tokens"]),
    cache_write_tokens: asNumber(attributes["pi.ai.usage.cache_write_tokens"]),
    reasoning_tokens: asNumber(attributes["pi.ai.usage.reasoning_tokens"]),
    total_tokens: asNumber(attributes["pi.ai.usage.total_tokens"]),
    cost_usd: cost === null ? null : String(cost),
    chunk_count: asNumber(attributes["pi.ai.stream.chunk_count"]),
    time_to_first_chunk_ms: asNumber(attributes["pi.ai.stream.time_to_first_chunk_ms"]),
    duration_ms: span.durationMs ?? null,
    started_at: new Date(span.startedAt).toISOString(),
    ended_at: endedAt,
    attributes: JSON.stringify(attributes),
    events: JSON.stringify(sanitizeEvents(span.events)),
  };
}
