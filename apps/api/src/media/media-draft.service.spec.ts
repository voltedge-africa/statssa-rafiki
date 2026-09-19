import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { AgentService } from "../agent/agent.service.ts";
import { hasFactTables } from "../agent/factstore.ts";
import { retrieve } from "../agent/rag/retrieve.ts";
import { MediaDraftService } from "./media-draft.service.ts";

vi.mock("../agent/rag/retrieve.ts", () => ({ retrieve: vi.fn() }));
vi.mock("../agent/factstore.ts", () => ({
  hasFactTables: vi.fn(),
  listFactTables: { name: "list_fact_tables" },
  queryFactstore: { name: "query_factstore" },
}));

const retrieveMock = vi.mocked(retrieve);
const hasFactTablesMock = vi.mocked(hasFactTables);

const hits = [
  {
    chunkId: 4,
    documentId: 1,
    source: "ghs-2025-statistical-release.md",
    title: "General Household Survey 2025",
    heading: null,
    page: null,
    text: "Access to improved sanitation rose to 84.0% in 2025.",
    score: 0.9,
  },
  {
    chunkId: 9,
    documentId: 2,
    source: "ghs-2025-media-release.md",
    title: "Other release",
    heading: null,
    page: null,
    text: "A passage the model does not rely on.",
    score: 0.5,
  },
];

function makeService() {
  const complete = vi.fn(async (_input: { system: string; user: string }) => ({
    text: "Inflation was 3.2% in July 2026 [cpi-index#4].",
    model: "test/model",
  }));
  const service = new MediaDraftService({ complete } as unknown as AgentService);
  return { complete, service };
}

describe("MediaDraftService", () => {
  beforeEach(() => {
    retrieveMock.mockReset();
    hasFactTablesMock.mockReset();
    hasFactTablesMock.mockResolvedValue(false);
  });

  it("flags a gap without calling the model when no passage is relevant", async () => {
    retrieveMock.mockResolvedValue([]);
    const { complete, service } = makeService();

    const result = await service.generate("Did inflation fall to 2%?", null);

    expect(result.text).toBeNull();
    expect(result.gap).toContain("No approved Stats SA source");
    expect(complete).not.toHaveBeenCalled();
  });

  it("flags a retrieval failure as an information gap", async () => {
    retrieveMock.mockRejectedValue(new Error("RAG index unavailable"));
    const { service } = makeService();

    const result = await service.generate("Did inflation fall to 2%?", null);

    expect(result.text).toBeNull();
    expect(result.gap).toContain("RAG index unavailable");
  });

  it("returns the draft with only the cited passages as references", async () => {
    retrieveMock.mockResolvedValue(hits);
    const { complete, service } = makeService();

    const result = await service.generate("Did inflation fall to 2%?", "Context here.");

    expect(result.text).toContain("[cpi-index#4]");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.chunkId).toBe(4);
    expect(result.gap).toBeNull();
    expect(complete).toHaveBeenCalledTimes(1);

    const prompt = complete.mock.calls[0]?.[0] as unknown as { system: string; user: string };
    expect(prompt.user).toContain("Context here.");
    expect(prompt.user).toContain("Access to improved sanitation rose to 84.0%");
    expect(prompt.system).toContain("INFORMATION_GAP");
  });

  it("uses claim and context alone for retrieval when there is no guidance", async () => {
    retrieveMock.mockResolvedValue(hits);
    const { service } = makeService();

    await service.generate("Did inflation fall to 2%?", "Context here.");

    expect(retrieveMock).toHaveBeenCalledWith("Did inflation fall to 2%?\n\nContext here.", 8);
  });

  it("threads reviewer guidance into retrieval and the prompt", async () => {
    retrieveMock.mockResolvedValue(hits);
    const { complete, service } = makeService();

    const result = await service.generate(
      "Did inflation fall to 2%?",
      null,
      "Emphasise core inflation alongside the headline figure.",
    );

    expect(result.text).toContain("[cpi-index#4]");
    expect(retrieveMock).toHaveBeenCalledWith(
      expect.stringContaining("Emphasise core inflation alongside the headline figure."),
      8,
    );

    const prompt = complete.mock.calls[0]?.[0] as unknown as { system: string; user: string };
    expect(prompt.user).toContain("Emphasise core inflation alongside the headline figure.");
    expect(prompt.system.toLowerCase()).toContain("guidance");
  });

  it("keeps all retrieved passages when the model cites nothing", async () => {
    retrieveMock.mockResolvedValue(hits);
    const complete = vi.fn(async () => ({ text: "A general answer.", model: "test/model" }));
    const service = new MediaDraftService({ complete } as unknown as AgentService);

    const result = await service.generate("Did inflation fall to 2%?", null);

    expect(result.sources).toHaveLength(2);
  });

  it("turns an INFORMATION_GAP reply into a gap result", async () => {
    retrieveMock.mockResolvedValue(hits);
    const complete = vi.fn(async () => ({
      text: "INFORMATION_GAP: The passages cover the index but not the 2% claim.",
      model: "test/model",
    }));
    const service = new MediaDraftService({ complete } as unknown as AgentService);

    const result = await service.generate("Did inflation fall to 2%?", null);

    expect(result.text).toBeNull();
    expect(result.gap).toContain("not the 2% claim");
  });

  it("surfaces a provider error as a gap", async () => {
    retrieveMock.mockResolvedValue(hits);
    const complete = vi.fn(async () => ({
      text: "",
      model: "test/model",
      error: "OpenCode Go API key is not configured.",
    }));
    const service = new MediaDraftService({ complete } as unknown as AgentService);

    const result = await service.generate("Did inflation fall to 2%?", null);

    expect(result.text).toBeNull();
    expect(result.gap).toContain("Draft generation unavailable");
  });

  it("consults the fact store when no passage is relevant but tables are loaded", async () => {
    retrieveMock.mockResolvedValue([]);
    hasFactTablesMock.mockResolvedValue(true);
    const complete = vi.fn(async (_input: { system: string; user: string }) => ({
      text: "The rate was 4,2% [factstore:cpi].",
      model: "test/model",
    }));
    const service = new MediaDraftService({ complete } as unknown as AgentService);

    const result = await service.generate("What was the CPI rate?", null);

    expect(complete).toHaveBeenCalledTimes(1);
    const input = complete.mock.calls[0]?.[0] as unknown as { tools: unknown[] };
    expect(input.tools.map((tool) => (tool as { name: string }).name)).toEqual([
      "list_fact_tables",
      "query_factstore",
    ]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.table).toBe("cpi");
    expect(result.sources[0]?.chunkId).toBeNull();
  });
});
