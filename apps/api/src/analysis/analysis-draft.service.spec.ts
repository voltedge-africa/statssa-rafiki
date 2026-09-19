import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { AgentService } from "../agent/agent.service.ts";
import { hasFactTables } from "../agent/factstore.ts";
import { retrieve } from "../agent/rag/retrieve.ts";
import { AnalysisDraftService } from "./analysis-draft.service.ts";

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
    heading: "Sanitation",
    page: null,
    text: "Access to improved sanitation rose to 84.0% in 2025, up from 82.5% in 2024.",
    score: 0.9,
    similarity: 0.91,
  },
  {
    chunkId: 9,
    documentId: 2,
    source: "ghs-2025-media-release.md",
    title: "GHS media release",
    heading: null,
    page: null,
    text: "A passage the model does not rely on.",
    score: 0.5,
    similarity: 0.86,
  },
];

const brief = {
  summary: "Household access to basic services improved [ghs-2025-statistical-release.md#4].",
  keyFindings: [
    {
      title: "Sanitation access",
      detail: "Improved sanitation rose to 84.0% in 2025 [ghs-2025-statistical-release.md#4].",
    },
  ],
  statistics: [
    {
      label: "Improved sanitation",
      value: "84.0%",
      period: "2025",
      context: "Up from 82.5% [ghs-2025-statistical-release.md#4].",
    },
  ],
  trends: [
    {
      title: "Sanitation",
      direction: "up",
      detail: "Up from 82.5% in 2024 [ghs-2025-statistical-release.md#4].",
    },
  ],
  insights: [],
  context: [],
};

function makeService(reply: string = JSON.stringify(brief), groundTruth: string[] = []) {
  const complete = vi.fn(async (_input: { system: string; user: string }) => ({
    text: reply,
    model: "test/model",
    groundTruth,
  }));
  const service = new AnalysisDraftService({ complete } as unknown as AgentService);
  return { complete, service };
}

describe("AnalysisDraftService", () => {
  beforeEach(() => {
    retrieveMock.mockReset();
    hasFactTablesMock.mockReset();
    hasFactTablesMock.mockResolvedValue(false);
    retrieveMock.mockResolvedValue(hits);
  });

  it("retrieves every review dimension scoped to the selected documents", async () => {
    const { service } = makeService();

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: "media angles",
      confidenceMin: 0.85,
    });

    expect(retrieveMock).toHaveBeenCalledTimes(5);
    for (const call of retrieveMock.mock.calls) {
      expect(call[2]).toEqual(["ghs-2025-statistical-release.md"]);
      expect(call[1]).toBe(6);
    }
    expect(retrieveMock.mock.calls.map((call) => call[0]).join(" ")).toContain("media angles");
    expect(result.content?.keyFindings).toHaveLength(1);
    expect(result.gap).toBeNull();
  });

  it("keeps only the passages the brief cites, and maps cited tables", async () => {
    const { service } = makeService(
      JSON.stringify({
        ...brief,
        statistics: [
          { label: "Assets", value: "1.2 million", context: "[factstore:household_assets]" },
        ],
      }),
    );

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });

    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toMatchObject({ chunkId: 4, table: null });
    expect(result.references[1]).toMatchObject({ chunkId: null, table: "household_assets" });
  });

  it("falls back to all retrieved passages when the brief cites none", async () => {
    const uncited = {
      ...brief,
      summary: "Household access to basic services improved.",
      keyFindings: [{ title: "Sanitation access", detail: "Improved sanitation rose." }],
      statistics: [],
      trends: [],
    };
    const { service } = makeService(JSON.stringify(uncited));

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });

    expect(result.references).toHaveLength(2);
  });

  it("escalates to a gap when retrieval confidence is below the floor, without calling the model", async () => {
    retrieveMock.mockResolvedValue([{ ...hits[0]!, similarity: 0.7 }]);
    const { complete, service } = makeService();

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });

    expect(result.content).toBeNull();
    expect(result.gap).toContain("confidence");
    expect(complete).not.toHaveBeenCalled();
  });

  it("flags a gap without calling the model when nothing is retrieved and the fact store is empty", async () => {
    retrieveMock.mockResolvedValue([]);
    const { complete, service } = makeService();

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });

    expect(result.content).toBeNull();
    expect(result.gap).toContain("could not find");
    expect(complete).not.toHaveBeenCalled();
  });

  it("surfaces a model INFORMATION_GAP reply as a gap", async () => {
    const { service } = makeService("INFORMATION_GAP: The release has no provincial breakdown.");

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });

    expect(result.content).toBeNull();
    expect(result.gap).toContain("provincial breakdown");
  });

  it("rejects unstructured model output", async () => {
    const { service } = makeService("Here is a lovely essay about sanitation.");

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });

    expect(result.content).toBeNull();
    expect(result.gap).toContain("unstructured");
  });

  it("verifies the brief's numbers against retrieved passages and tool results", async () => {
    const invented = {
      ...brief,
      statistics: [{ label: "Invented", value: "99.9%" }],
    };
    const { service } = makeService(JSON.stringify(invented), ["99.9"]);

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });

    expect(result.verification.status).toBe("verified");

    const { service: noTool } = makeService(JSON.stringify(invented));
    const unverified = await noTool.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });
    expect(unverified.verification.status).toBe("unverified");
    expect(unverified.verification.unverified).toContain("99.9");
  });

  it("offers the fact-store tools and reports a provider failure as a gap", async () => {
    const complete = vi.fn(async (_input: { tools: { name: string }[] }) => ({
      text: "",
      model: "test/model",
      error: "provider down",
      groundTruth: [],
    }));
    const service = new AnalysisDraftService({ complete } as unknown as AgentService);

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });

    expect(result.content).toBeNull();
    expect(result.gap).toContain("unavailable");
    expect(complete.mock.calls[0]?.[0].tools.map((tool) => tool.name)).toEqual([
      "list_fact_tables",
      "query_factstore",
    ]);
  });

  it("still drafts when passages are empty but the fact store has tables", async () => {
    retrieveMock.mockResolvedValue([]);
    hasFactTablesMock.mockResolvedValue(true);
    const { complete, service } = makeService();

    const result = await service.generate({
      sources: ["ghs-2025-statistical-release.md"],
      focus: null,
      confidenceMin: 0.85,
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.content).not.toBeNull();
  });
});
