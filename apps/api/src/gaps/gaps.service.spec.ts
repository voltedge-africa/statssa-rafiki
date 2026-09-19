import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { embedQuery } from "../agent/rag/embed.ts";
import type { GapsRepository } from "./gaps.repository.ts";
import { GapsService, runningMean } from "./gaps.service.ts";

vi.mock("../agent/rag/embed.ts", () => ({ embedQuery: vi.fn() }));

const embedMock = vi.mocked(embedQuery);

const NOW = new Date("2026-09-19T13:45:00.000Z");

function makeService() {
  const repo = {
    nearestCategory: vi.fn(),
    createCategory: vi.fn(),
    addQueryToCategory: vi.fn(),
    insertQuery: vi.fn(),
    summary: vi.fn(),
    listCategories: vi.fn(),
    listQueries: vi.fn(),
    pendingCategories: vi.fn(),
    setCategoryLabel: vi.fn(),
  };
  const service = new GapsService(repo as unknown as GapsRepository);
  return { repo, service };
}

describe("runningMean", () => {
  it("folds a new vector into the running mean", () => {
    const next = runningMean([1, 0], 1, new Float32Array([0, 1]));
    expect(Array.from(next)).toEqual([0.5, 0.5]);
  });

  it("starts from the incoming vector for the first member", () => {
    const next = runningMean([], 0, new Float32Array([0.25, 0.75]));
    expect(Array.from(next)).toEqual([0.25, 0.75]);
  });
});

describe("GapsService.record", () => {
  beforeEach(() => {
    embedMock.mockReset();
    embedMock.mockResolvedValue(new Float32Array([1, 0, 0]));
  });

  it("files a query into the nearest category when it is close enough", async () => {
    const { repo, service } = makeService();
    repo.nearestCategory.mockResolvedValue({
      id: "cat-1",
      label: "GBV death toll",
      queryCount: 3,
      centroid: "[0,1,0]",
      similarity: 0.91,
    });

    await service.record({ surface: "chat", query: "gbv death toll 2026", role: "Press" });

    expect(repo.addQueryToCategory).toHaveBeenCalledWith(
      "cat-1",
      new Float32Array([0.25, 0.75, 0]),
      3,
    );
    expect(repo.createCategory).not.toHaveBeenCalled();
    expect(repo.insertQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: "cat-1",
        surface: "chat",
        query: "gbv death toll 2026",
        role: "Press",
      }),
    );
  });

  it("opens a category with a readable fallback label when nothing is close", async () => {
    const { repo, service } = makeService();
    repo.nearestCategory.mockResolvedValue({
      id: "cat-2",
      label: "Unrelated",
      queryCount: 9,
      similarity: 0.42,
    });

    await service.record({ surface: "chat", query: "gbv death toll in south africa?" });

    expect(repo.addQueryToCategory).not.toHaveBeenCalled();
    expect(repo.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Gbv death toll in south africa" }),
    );
    expect(repo.insertQuery).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: expect.any(String) }),
    );
  });

  it("opens the first category when the log is empty", async () => {
    const { repo, service } = makeService();
    repo.nearestCategory.mockResolvedValue(null);

    await service.record({ surface: "media_draft", query: "What was the CPI in July?" });

    expect(repo.createCategory).toHaveBeenCalledTimes(1);
  });

  it("still records the query when embedding is unavailable", async () => {
    const { repo, service } = makeService();
    embedMock.mockRejectedValue(new Error("model unavailable"));

    await service.record({
      surface: "media_draft",
      query: "Any question",
      reference: "MEDIA-2026-ABC123",
    });

    expect(repo.nearestCategory).not.toHaveBeenCalled();
    expect(repo.insertQuery).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null, reference: "MEDIA-2026-ABC123" }),
    );
  });

  it("normalises whitespace, caps length and skips empty queries", async () => {
    const { repo, service } = makeService();

    await service.record({ surface: "chat", query: "   " });
    expect(repo.insertQuery).not.toHaveBeenCalled();

    await service.record({ surface: "chat", query: `  a\n\n  b  ${"x".repeat(3000)}` });
    const inserted = repo.insertQuery.mock.calls[0]?.[0] as { query: string };
    expect(inserted.query.startsWith("a b ")).toBe(true);
    expect(inserted.query.length).toBeLessThanOrEqual(2000);
  });
});

describe("GapsService.summary", () => {
  beforeEach(() => embedMock.mockReset());

  it("aligns daily counts and surfaces to the window and derives shares", async () => {
    const { repo, service } = makeService();
    repo.summary.mockResolvedValue({
      total: 5,
      categories: 4,
      newCategories: 2,
      daily: [{ date: "2026-09-19", count: 5 }],
      surfaces: [{ surface: "chat", count: 3 }],
      topCategories: [
        { id: "cat-1", label: "GBV death toll", queryCount: 4, lastSeen: new Date() },
      ],
      topOutlets: [{ outlet: "Daily Maverick", count: 2 }],
    });

    const summary = await service.summary(7, NOW);

    expect(summary.days).toBe(7);
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.at(-1)).toEqual({ date: "2026-09-19", count: 5 });
    expect(summary.surfaces).toEqual([
      { surface: "chat", count: 3 },
      { surface: "media_draft", count: 0 },
    ]);
    expect(summary.topCategories[0]?.share).toBe(0.8);
    expect(summary.topOutlets).toEqual([{ outlet: "Daily Maverick", count: 2 }]);
  });

  it("returns a null share for an empty window", async () => {
    const { repo, service } = makeService();
    repo.summary.mockResolvedValue({
      total: 0,
      categories: 0,
      newCategories: 0,
      daily: [],
      surfaces: [],
      topCategories: [{ id: "cat-1", label: "Old", queryCount: 0, lastSeen: new Date() }],
      topOutlets: [],
    });

    const summary = await service.summary(7, NOW);
    expect(summary.topCategories[0]?.share).toBeNull();
    expect(summary.daily.every((day) => day.count === 0)).toBe(true);
  });
});
