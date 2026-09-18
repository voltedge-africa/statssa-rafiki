import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecordedSpan, TelemetrySummary } from "@voltedge/agent-contract";
import { numeric } from "../lib/format.ts";

const MAX_SPANS = 500;

type StreamEvent =
  | { type: "snapshot"; spans: RecordedSpan[] }
  | { type: "span"; span: RecordedSpan }
  | { type: "clear" };

export interface UseTelemetryOptions {
  /** Base URL of the agent API. Empty string targets the current origin. */
  apiBase?: string;
  /** Open the telemetry stream. Defaults to true. */
  enabled?: boolean;
}

export function useTelemetry(options: UseTelemetryOptions = {}) {
  const apiBase = options.apiBase ?? "";
  const enabled = options.enabled ?? true;
  const [spans, setSpans] = useState<RecordedSpan[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const source = new EventSource(`${apiBase}/api/telemetry/stream`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      let event: StreamEvent;
      try {
        event = JSON.parse(message.data) as StreamEvent;
      } catch {
        return;
      }

      if (event.type === "snapshot") {
        setSpans(event.spans.slice(-MAX_SPANS));
      } else if (event.type === "span") {
        setSpans((prev) => {
          const index = prev.findIndex((span) => span.id === event.span.id);
          if (index === -1) return [...prev, event.span].slice(-MAX_SPANS);
          const next = [...prev];
          next[index] = event.span;
          return next;
        });
      } else if (event.type === "clear") {
        setSpans([]);
      }
    };

    return () => source.close();
  }, [apiBase, enabled]);

  const summary = useMemo<TelemetrySummary>(() => {
    let requests = 0;
    let tools = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let cost = 0;
    let durationTotal = 0;
    let durationCount = 0;

    for (const span of spans) {
      if (span.name === "pi.ai.request") {
        requests += 1;
        tokensIn += numeric(span.attributes["pi.ai.usage.input_tokens"]);
        tokensOut += numeric(span.attributes["pi.ai.usage.output_tokens"]);
        cost += numeric(span.attributes["pi.ai.usage.cost"]);
        if (span.durationMs !== undefined) {
          durationTotal += span.durationMs;
          durationCount += 1;
        }
      } else if (span.name === "rafiki.tool") {
        tools += 1;
      }
    }

    return {
      requests,
      tools,
      tokensIn,
      tokensOut,
      cost,
      avgMs: durationCount ? Math.round(durationTotal / durationCount) : 0,
    };
  }, [spans]);

  const clear = useCallback(async () => {
    setSpans([]);
    await fetch(`${apiBase}/api/telemetry/clear`, { method: "POST" }).catch(() => undefined);
  }, [apiBase]);

  return { spans, summary, connected, clear };
}
