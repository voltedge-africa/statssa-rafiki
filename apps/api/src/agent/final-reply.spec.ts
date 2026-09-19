import { describe, expect, it, vi } from "vite-plus/test";
import type { ChatEvent } from "@voltedge/agent-contract";
import { AgentService } from "./agent.service.ts";
import { NORMALIZER_MODEL, WRAPPER_MODEL } from "./config.ts";

/**
 * Unit tests for the pieces the public `/api/chat/final` route is built from. The provider calls are
 * mocked: `complete()` is the single seam the normalizer and formatter use, and `runChat()` is the
 * retrieval agent, so a fake event stream drives the whole pipeline without a model or a database.
 */

type Normalize = (raw: string) => Promise<{ query: string; outOfScope: boolean; reason?: string }>;
type Format = (
  raw: string,
  fallback: string,
) => Promise<{ text: string; model: string; usedFallback: boolean }>;

const normalizer =
  (service: AgentService): Normalize =>
  (raw) =>
    (service as unknown as { normalizeQuestion: Normalize }).normalizeQuestion.call(service, raw);
const formatter =
  (service: AgentService): Format =>
  (raw, fallback) =>
    (service as unknown as { formatReply: Format }).formatReply.call(service, raw, fallback);

function makeService(): AgentService {
  return new AgentService({} as never, {} as never);
}

/** Drive `complete()` per feature so the normalizer and formatter get their own canned replies. */
function mockComplete(service: AgentService, replies: { normalize?: string; format?: string }) {
  return vi.spyOn(service, "complete").mockImplementation(async (input) => {
    const text =
      input.feature === "openwa_normalize" ? (replies.normalize ?? "") : (replies.format ?? "");
    return { text, model: input.model ?? WRAPPER_MODEL };
  });
}

describe("normalizeQuestion", () => {
  it("returns the model's translated question", async () => {
    const service = makeService();
    mockComplete(service, { normalize: "What percentage of households have internet access?" });

    const result = await normalizer(service)("do people have wifi?");

    expect(result.outOfScope).toBe(false);
    expect(result.query).toBe("What percentage of households have internet access?");
  });

  it("flags OUT_OF_SCOPE without answering", async () => {
    const service = makeService();
    mockComplete(service, { normalize: "OUT_OF_SCOPE: not a GHS topic" });

    const result = await normalizer(service)("who won the world cup?");

    expect(result.outOfScope).toBe(true);
    expect(result.reason).toBe("not a GHS topic");
  });

  it("fails open (keeps the original) when the normalizer errors", async () => {
    const service = makeService();
    vi.spyOn(service, "complete").mockResolvedValue({
      text: "",
      model: NORMALIZER_MODEL,
      error: "boom",
    });

    const result = await normalizer(service)("how many households are there?");

    expect(result.outOfScope).toBe(false);
    expect(result.query).toBe("how many households are there?");
  });

  it("falls back to the original when the rewrite is too short to be a question", async () => {
    const service = makeService();
    mockComplete(service, { normalize: "." });

    const result = await normalizer(service)("what is the population?");

    expect(result.query).toBe("what is the population?");
  });
});

describe("formatReply", () => {
  it("keeps the formatted text when its numbers are all grounded", async () => {
    const service = makeService();
    mockComplete(service, { format: "In 2025, 85.6% of households had access." });

    const result = await formatter(service)("85.6% in 2025 [source#3]", "85.6% in 2025 [source#3]");

    expect(result.usedFallback).toBe(false);
    expect(result.text).toBe("In 2025, 85.6% of households had access.");
  });

  it("falls back when the formatter introduces an ungrounded number", async () => {
    const service = makeService();
    mockComplete(service, { format: "99.9% of households had access." });

    const result = await formatter(service)(
      "85.6% of households had access",
      "85.6% of households had access",
    );

    expect(result.usedFallback).toBe(true);
    expect(result.text).toBe("85.6% of households had access");
  });

  it("falls back when the formatter errors", async () => {
    const service = makeService();
    vi.spyOn(service, "complete").mockResolvedValue({
      text: "",
      model: WRAPPER_MODEL,
      error: "provider down",
    });

    const result = await formatter(service)("grounded answer", "grounded answer");

    expect(result.usedFallback).toBe(true);
    expect(result.text).toBe("grounded answer");
  });
});

describe("runFinalReply", () => {
  const emitSequence =
    (events: ChatEvent[]) => (_request: unknown, onEvent: (event: ChatEvent) => void) => {
      for (const event of events) onEvent(event);
      return Promise.resolve();
    };

  it("keeps only the final answer segment and forwards the normalized question", async () => {
    const service = makeService();
    mockComplete(service, { normalize: "translated question", format: "final reply" });
    const runChat = vi
      .spyOn(service, "runChat")
      .mockImplementation(
        emitSequence([
          { type: "text", delta: "I'll look that up in the data store." },
          { type: "tool_start", name: "search_statssa", args: {}, toolCallId: "t1" },
          { type: "text", delta: "85.6% of households had access [source#3]." },
          { type: "done" },
        ]),
      );

    const result = await service.runFinalReply({
      sessionId: "s1",
      message: "do people have wifi?",
    });

    expect(result.answer).toBe("final reply");
    expect(result.grounded).toContain("85.6% of households had access");
    expect(result.grounded).not.toContain("I'll look that up");
    expect(result.normalizedQuery).toBe("translated question");
    expect(result.tables).toEqual([]);
    // The retrieval agent gets the rewrite plus the user's original wording.
    expect(runChat).toHaveBeenCalledTimes(1);
    const passed = runChat.mock.calls[0]?.[0] as { message: string };
    expect(passed.message).toContain("translated question");
    expect(passed.message).toContain("do people have wifi?");
  });

  it("carries table UI blocks out of the event stream", async () => {
    const service = makeService();
    mockComplete(service, { normalize: "q", format: "reply" });
    vi.spyOn(service, "runChat").mockImplementation(
      emitSequence([
        {
          type: "ui",
          toolCallId: "t1",
          block: {
            component: "table",
            title: "Assets",
            columns: ["Asset"],
            rows: [["Refrigerator"]],
          },
        },
        { type: "text", delta: "One row." },
        { type: "done" },
      ]),
    );

    const result = await service.runFinalReply({ sessionId: "s2", message: "show a table" });

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]?.title).toBe("Assets");
  });

  it("short-circuits out-of-scope questions without running the retrieval agent", async () => {
    const service = makeService();
    mockComplete(service, { normalize: "OUT_OF_SCOPE: sport" });
    const runChat = vi.spyOn(service, "runChat");

    const result = await service.runFinalReply({
      sessionId: "s3",
      message: "who won the world cup?",
    });

    expect(result.outOfScope).toBe(true);
    expect(result.answer).toContain("outside the Stats SA studies");
    expect(runChat).not.toHaveBeenCalled();
  });
});
