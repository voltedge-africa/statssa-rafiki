import { Injectable } from "@nestjs/common";
import type { AiUsageBucket } from "@voltedge/agent-contract";
import {
  analyticsWindow,
  type AiAnalytics,
  type AnalyticsCount,
  type AnalyticsSnapshot,
  type MediaAnalytics,
  type MediaDay,
  type PopiaAnalytics,
  type PopiaDay,
} from "@voltedge/analytics-contract";
import { MEDIA_REQUEST_STATUSES, type MediaRequestStatus } from "@voltedge/media-contract";
import {
  POPIA_REQUEST_STATUSES,
  POPIA_REQUEST_TYPES,
  type PopiaRequestStatus,
  type PopiaRequestType,
} from "@voltedge/popia-contract";
import { TelemetryRepository } from "../agent/telemetry.repository.ts";
import { AnalyticsRepository, type DayCount } from "./analytics.repository.ts";

export const DEFAULT_DAYS = 30;
export const MIN_DAYS = 7;
export const MAX_DAYS = 365;

/** `part / whole`, or null when nothing happened — never a fake zero rate. */
export function share(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/** A date-keyed map of the counts a SQL `GROUP BY day` returned. */
export function countsByDate(rows: DayCount[]): Map<string, number> {
  return new Map(rows.map((row) => [row.date, row.count]));
}

/** Every status in lifecycle order, zero-filled — a stable chart axis. */
function orderedCounts<K extends string>(
  rows: AnalyticsCount<K>[],
  order: readonly K[],
): AnalyticsCount<K>[] {
  const counts = new Map(rows.map((row) => [row.key, row.count]));
  return order.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

function emptyAiDay(date: string): AiUsageBucket {
  return {
    key: date,
    requests: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    avgDurationMs: 0,
    errorCount: 0,
  };
}

/**
 * Assemble the dashboard snapshot from the desks' read models and the AI
 * telemetry rollup. State metrics come from the aggregates untouched; every
 * daily series is aligned to the window's days so charts cannot skip a date.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly telemetry: TelemetryRepository,
  ) {}

  async snapshot(
    days: number,
    includeAi: boolean,
    now: Date = new Date(),
  ): Promise<AnalyticsSnapshot> {
    const { from, to, dates } = analyticsWindow(days, now);

    const [popia, media, usage] = await Promise.all([
      this.analytics.popia(from, to),
      this.analytics.media(from, to),
      includeAi ? this.telemetry.summary({ from: from.toISOString(), to: to.toISOString() }) : null,
    ]);

    const popiaReceived = countsByDate(popia.receivedDaily);
    const popiaClosed = countsByDate(popia.closedDaily);
    const popiaDaily: PopiaDay[] = dates.map((date) => ({
      date,
      received: popiaReceived.get(date) ?? 0,
      closed: popiaClosed.get(date) ?? 0,
    }));

    const mediaReceived = countsByDate(media.receivedDaily);
    const mediaApproved = countsByDate(media.approvedDaily);
    const mediaDaily: MediaDay[] = dates.map((date) => ({
      date,
      received: mediaReceived.get(date) ?? 0,
      approved: mediaApproved.get(date) ?? 0,
    }));

    const popiaAnalytics: PopiaAnalytics = {
      received: popia.received,
      closed: popia.closed,
      open: popia.open,
      overdue: popia.overdue,
      dueSoon: popia.dueSoon,
      avgResolutionHours: popia.avgResolutionHours,
      byStatus: orderedCounts<PopiaRequestStatus>(popia.byStatus, POPIA_REQUEST_STATUSES),
      byType: orderedCounts<PopiaRequestType>(popia.byType, POPIA_REQUEST_TYPES),
      daily: popiaDaily,
    };

    const mediaAnalytics: MediaAnalytics = {
      received: media.received,
      approved: media.approved,
      rejected: media.rejected,
      open: media.open,
      awaitingReview: media.awaitingReview,
      informationGaps: media.informationGaps,
      approvalRate: share(media.approved, media.approved + media.rejected),
      avgReviewHours: media.avgReviewHours,
      byStatus: orderedCounts<MediaRequestStatus>(media.byStatus, MEDIA_REQUEST_STATUSES),
      daily: mediaDaily,
    };

    const byDay = new Map(usage?.byDay.map((bucket) => [bucket.key, bucket]) ?? []);
    const ai: AiAnalytics | null = usage
      ? {
          requests: usage.totals.requests,
          toolCalls: usage.totals.toolCalls,
          totalTokens: usage.totals.totalTokens,
          costUsd: usage.totals.costUsd,
          errorCount: usage.totals.errorCount,
          errorRate:
            share(usage.totals.errorCount, usage.totals.requests + usage.totals.toolCalls) ?? 0,
          avgDurationMs: usage.totals.avgDurationMs,
          byModel: usage.byModel,
          daily: dates.map((date) => byDay.get(date) ?? emptyAiDay(date)),
        }
      : null;

    return {
      generatedAt: now.toISOString(),
      days,
      from: from.toISOString(),
      to: to.toISOString(),
      popia: popiaAnalytics,
      media: mediaAnalytics,
      ai,
    };
  }
}
