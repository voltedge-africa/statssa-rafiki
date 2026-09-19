import { describe, expect, it, vi } from "vite-plus/test";
import { MEDIA_REQUEST_STATUSES } from "@voltedge/media-contract";
import { POPIA_REQUEST_STATUSES } from "@voltedge/popia-contract";
import type { TelemetryRepository } from "../agent/telemetry.repository.ts";
import type { AnalyticsRepository } from "./analytics.repository.ts";
import { AnalyticsService, share } from "./analytics.service.ts";

const NOW = new Date("2026-09-19T13:45:00.000Z");

describe("share", () => {
  it("returns null when the denominator is empty", () => {
    expect(share(0, 0)).toBeNull();
    expect(share(1, 4)).toBe(0.25);
  });
});

function makeService() {
  const popia = vi.fn().mockResolvedValue({
    received: 12,
    closed: 5,
    open: 3,
    overdue: 1,
    dueSoon: 2,
    avgResolutionHours: 30,
    byStatus: [
      { key: "in_review", count: 2 },
      { key: "completed", count: 5 },
    ],
    byType: [{ key: "access", count: 7 }],
    receivedDaily: [{ date: "2026-08-21", count: 2 }],
    closedDaily: [],
  });

  const media = vi.fn().mockResolvedValue({
    received: 4,
    approved: 3,
    rejected: 1,
    open: 2,
    awaitingReview: 1,
    informationGaps: 1,
    avgReviewHours: 6,
    byStatus: [{ key: "approved", count: 3 }],
    receivedDaily: [],
    approvedDaily: [{ date: "2026-09-19", count: 1 }],
  });

  const summary = vi.fn().mockResolvedValue({
    totals: {
      requests: 10,
      toolCalls: 20,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      costUsd: 0.25,
      avgDurationMs: 800,
      errorCount: 3,
    },
    byModel: [{ key: "test/model", requests: 10 }],
    byTool: [],
    byFeature: [],
    byRole: [],
    byDay: [
      {
        key: "2026-09-19",
        requests: 10,
        toolCalls: 20,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        costUsd: 0.25,
        avgDurationMs: 800,
        errorCount: 3,
      },
    ],
  });

  const service = new AnalyticsService(
    { popia, media } as unknown as AnalyticsRepository,
    { summary } as unknown as TelemetryRepository,
  );

  return { popia, media, summary, service };
}

describe("AnalyticsService", () => {
  it("aligns every daily series to the window and keeps status axes stable", async () => {
    const { service, summary } = makeService();
    const snapshot = await service.snapshot(30, true, NOW);

    expect(snapshot.popia.daily).toHaveLength(30);
    expect(snapshot.popia.daily[0]).toEqual({ date: "2026-08-21", received: 2, closed: 0 });
    expect(snapshot.popia.daily.at(-1)).toEqual({
      date: "2026-09-19",
      received: 0,
      closed: 0,
    });
    expect(snapshot.media.daily.at(-1)).toEqual({
      date: "2026-09-19",
      received: 0,
      approved: 1,
    });

    expect(snapshot.popia.byStatus).toHaveLength(POPIA_REQUEST_STATUSES.length);
    expect(snapshot.media.byStatus).toHaveLength(MEDIA_REQUEST_STATUSES.length);
    expect(snapshot.popia.byStatus.find((row) => row.key === "completed")?.count).toBe(5);
    expect(snapshot.popia.byStatus.find((row) => row.key === "submitted")?.count).toBe(0);

    expect(summary).toHaveBeenCalledWith({
      from: "2026-08-21T00:00:00.000Z",
      to: "2026-09-20T00:00:00.000Z",
    });
  });

  it("derives approval and error rates, and omits AI for non-admins", async () => {
    const { service } = makeService();

    const withAi = await service.snapshot(7, true, NOW);
    expect(withAi.media.approvalRate).toBe(0.75);
    expect(withAi.ai?.errorRate).toBeCloseTo(3 / 30);
    expect(withAi.ai?.daily).toHaveLength(7);
    expect(withAi.ai?.daily.at(-1)?.requests).toBe(10);

    const staff = await service.snapshot(7, false, NOW);
    expect(staff.ai).toBeNull();
  });

  it("reports no rate rather than a fake zero when nothing was decided", async () => {
    const { media, summary, service } = makeService();
    media.mockResolvedValue({
      received: 0,
      approved: 0,
      rejected: 0,
      open: 0,
      awaitingReview: 0,
      informationGaps: 0,
      avgReviewHours: null,
      byStatus: [],
      receivedDaily: [],
      approvedDaily: [],
    });
    summary.mockResolvedValue({
      totals: {
        requests: 0,
        toolCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        avgDurationMs: 0,
        errorCount: 0,
      },
      byModel: [],
      byTool: [],
      byFeature: [],
      byRole: [],
      byDay: [],
    });

    const snapshot = await service.snapshot(7, false, NOW);
    expect(snapshot.media.approvalRate).toBeNull();

    const withAi = await service.snapshot(7, true, NOW);
    expect(withAi.media.approvalRate).toBeNull();
    expect(withAi.ai?.errorRate).toBe(0);
  });
});
