import type { RecordedSpan } from "@voltedge/agent-contract";
import { describe, expect, it } from "vite-plus/test";
import {
  isSensitiveAttribute,
  sanitizeAttributes,
  spanKind,
  toAiSpanWrite,
} from "./telemetry.flatten.ts";

function span(overrides: Partial<RecordedSpan> = {}): RecordedSpan {
  return {
    id: 1,
    uid: "11111111-1111-1111-1111-111111111111",
    parentId: null,
    parentUid: null,
    name: "pi.ai.request",
    attributes: {},
    events: [],
    status: "ok",
    startedAt: 1_700_000_000_000,
    settled: true,
    ...overrides,
  };
}

describe("sanitizeAttributes", () => {
  it("keeps operational attributes and token metadata", () => {
    const result = sanitizeAttributes({
      "pi.ai.model": "muse-spark",
      "pi.ai.usage.output_tokens": 42,
      "pi.ai.response.model": "muse-spark",
      "tool.name": "search_statssa",
    });

    expect(result).toEqual({
      "pi.ai.model": "muse-spark",
      "pi.ai.usage.output_tokens": 42,
      "pi.ai.response.model": "muse-spark",
      "tool.name": "search_statssa",
    });
  });

  it("drops content-bearing attributes", () => {
    const result = sanitizeAttributes({
      "tool.args": { query: "secret" },
      "tool.result": "passage text",
      "rafiki.prompt": "tell me",
      message: "hello",
      "pi.ai.response.text": "the answer",
      "pi.ai.payload": { body: 1 },
    });

    expect(result).toEqual({});
    expect(isSensitiveAttribute("tool.args")).toBe(true);
    expect(isSensitiveAttribute("pi.ai.payload.body")).toBe(true);
    expect(isSensitiveAttribute("pi.ai.usage.output_tokens")).toBe(false);
  });
});

describe("spanKind", () => {
  it("classifies known span names", () => {
    expect(spanKind("pi.ai.request")).toBe("model_request");
    expect(spanKind("rafiki.tool")).toBe("tool");
    expect(spanKind("rafiki.turn")).toBe("turn");
    expect(spanKind("rafiki.completion")).toBe("turn");
    expect(spanKind("pi.harness.run")).toBe("other");
  });
});

describe("toAiSpanWrite", () => {
  it("flattens a model request with usage and origin", () => {
    const row = toAiSpanWrite(
      span({
        name: "pi.ai.request",
        parentUid: "22222222-2222-2222-2222-222222222222",
        durationMs: 1500,
        endedAt: 1_700_000_001_500,
        attributes: {
          "session.id": "chat-1",
          "rafiki.feature": "chat",
          "rafiki.client.role": "Staff",
          "rafiki.client.origin": "control.example",
          "pi.ai.provider": "opencode-go",
          "pi.ai.model": "muse-spark",
          "pi.ai.response.model": "muse-spark-1.3",
          "pi.ai.operation": "stream",
          "pi.ai.response.stop_reason": "tool_use",
          "pi.ai.usage.input_tokens": 100,
          "pi.ai.usage.output_tokens": 20,
          "pi.ai.usage.total_tokens": 120,
          "pi.ai.usage.cost": 0.0042,
          "pi.ai.stream.chunk_count": 7,
          prompt: "not stored",
        },
      }),
    );

    expect(row).toMatchObject({
      span_uid: "11111111-1111-1111-1111-111111111111",
      parent_uid: "22222222-2222-2222-2222-222222222222",
      session_id: "chat-1",
      name: "pi.ai.request",
      kind: "model_request",
      feature: "chat",
      client_role: "Staff",
      client_origin: "control.example",
      provider: "opencode-go",
      model: "muse-spark",
      response_model: "muse-spark-1.3",
      stop_reason: "tool_use",
      status: "ok",
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      cost_usd: "0.0042",
      chunk_count: 7,
      duration_ms: 1500,
    });
    expect(row.started_at).toBe(new Date(1_700_000_000_000).toISOString());
    expect(row.ended_at).toBe(new Date(1_700_000_001_500).toISOString());
    expect(JSON.parse(row.attributes)).not.toHaveProperty("prompt");
    expect(JSON.parse(row.attributes)).toHaveProperty("pi.ai.usage.output_tokens", 20);
  });

  it("flattens a tool span and carries the error status", () => {
    const row = toAiSpanWrite(
      span({
        name: "rafiki.tool",
        status: "error",
        errorMessage: "Tool returned an error",
        attributes: {
          "session.id": "chat-1",
          "tool.name": "search_statssa",
          "tool.call_id": "call-9",
          "tool.is_error": true,
        },
      }),
    );

    expect(row).toMatchObject({
      kind: "tool",
      tool_name: "search_statssa",
      tool_call_id: "call-9",
      tool_is_error: true,
      status: "error",
      error_message: "Tool returned an error",
    });
  });

  it("sanitizes events as well as attributes", () => {
    const row = toAiSpanWrite(
      span({
        events: [{ name: "retry", attributes: { attempt: 2, message: "verbose" }, timestamp: 1 }],
      }),
    );

    const events = JSON.parse(row.events) as { attributes: Record<string, unknown> }[];
    expect(events[0]?.attributes).toEqual({ attempt: 2 });
  });
});
