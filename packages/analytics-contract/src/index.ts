import type { AiUsageBucket } from "@voltedge/agent-contract";
import type { MediaRequestStatus } from "@voltedge/media-contract";
import type { PopiaRequestStatus, PopiaRequestType } from "@voltedge/popia-contract";

/**
 * The cross-desk analytics snapshot.
 *
 * One shape, one endpoint. State metrics (`open`, `overdue`) describe the desks
 * right now; flow metrics (`received`, `closed`, `approved`, daily series) cover
 * the selected window only. Every daily series is zero-filled and UTC-aligned, so
 * a quiet day reads as zero rather than a gap in the chart.
 */

/** A keyed count: a status, right or model, and how many rows sit in it. */
export interface AnalyticsCount<K extends string = string> {
  key: K;
  count: number;
}

/** One UTC day in the window. */
export interface AnalyticsDay {
  date: string;
}

export interface PopiaDay extends AnalyticsDay {
  received: number;
  closed: number;
}

export interface MediaDay extends AnalyticsDay {
  received: number;
  approved: number;
}

/** POPIA case-desk analytics. */
export interface PopiaAnalytics {
  /** Requests received in the window. */
  received: number;
  /** Requests closed in the window. */
  closed: number;
  /** Requests still open right now, regardless of when they arrived. */
  open: number;
  /** Open requests past their due date right now. */
  overdue: number;
  /** Open requests due within the next 72 hours. */
  dueSoon: number;
  /** Average hours from receipt to closure for requests closed in the window. */
  avgResolutionHours: number | null;
  /** Current status of every request, all time — where the backlog sits. */
  byStatus: AnalyticsCount<PopiaRequestStatus>[];
  /** The right exercised by requests received in the window. */
  byType: AnalyticsCount<PopiaRequestType>[];
  /** Daily received/closed counts in the window, zero-filled. */
  daily: PopiaDay[];
}

/** Media fact-check desk analytics. */
export interface MediaAnalytics {
  /** Requests received in the window. */
  received: number;
  /** Responses approved in the window. */
  approved: number;
  /** Requests rejected in the window. */
  rejected: number;
  /** Requests still open right now, regardless of when they arrived. */
  open: number;
  /** Requests awaiting reviewer sign-off right now. */
  awaitingReview: number;
  /** Requests parked as information gaps right now. */
  informationGaps: number;
  /** Approved divided by decided (approved + rejected) in the window; null when nothing was decided. */
  approvalRate: number | null;
  /** Average hours from receipt to approval for responses approved in the window. */
  avgReviewHours: number | null;
  /** Current status of every request, all time — where the backlog sits. */
  byStatus: AnalyticsCount<MediaRequestStatus>[];
  /** Daily received/approved counts in the window, zero-filled. */
  daily: MediaDay[];
}

/** AI usage in the window. Present only for Admin callers. */
export interface AiAnalytics {
  requests: number;
  toolCalls: number;
  totalTokens: number;
  costUsd: number;
  errorCount: number;
  /** Errors as a share of model requests plus tool calls; 0 when there was no activity. */
  errorRate: number;
  avgDurationMs: number;
  /** Model calls grouped by model, busiest first. */
  byModel: AiUsageBucket[];
  /** Daily model and tool activity in the window, zero-filled. */
  daily: AiUsageBucket[];
}

/** The half-open UTC window a snapshot covers. */
export interface AnalyticsWindow {
  /** Start of the window (inclusive). */
  from: Date;
  /** End of the window (exclusive). */
  to: Date;
  /** Every UTC day in the window as `YYYY-MM-DD`, oldest first. */
  dates: string[];
}

const DAY_MS = 86_400_000;

/**
 * The window `[from, to)` ending at tomorrow's UTC midnight, with one date per
 * day. The window ends tomorrow so today's partial day is always included.
 */
export function analyticsWindow(days: number, now: Date = new Date()): AnalyticsWindow {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const from = new Date(to.getTime() - days * DAY_MS);
  const dates: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    dates.push(new Date(from.getTime() + offset * DAY_MS).toISOString().slice(0, 10));
  }
  return { from, to, dates };
}

/** The body of `GET /analytics` — everything the dashboard renders for one window. */
export interface AnalyticsSnapshot {
  generatedAt: string;
  /** Window length in days. */
  days: number;
  /** Start of the window (inclusive), ISO date-time. */
  from: string;
  /** End of the window (exclusive), ISO date-time. */
  to: string;
  popia: PopiaAnalytics;
  media: MediaAnalytics;
  ai: AiAnalytics | null;
}
