import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { AnalyticsCount } from "@voltedge/analytics-contract";
import {
  isOpenStatus as isMediaOpen,
  MEDIA_REQUEST_STATUSES,
  type MediaRequestStatus,
} from "@voltedge/media-contract";
import {
  isOpenStatus as isPopiaOpen,
  POPIA_REQUEST_STATUSES,
  type PopiaRequestStatus,
  type PopiaRequestType,
} from "@voltedge/popia-contract";
import postgres, { type Sql } from "postgres";
import { orDefault } from "../env.ts";

const DEFAULT_DATABASE_URL = "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth";

// The contracts own the open/terminal split; the SQL below only ever sees the lists.
const OPEN_POPIA = POPIA_REQUEST_STATUSES.filter(isPopiaOpen);
const OPEN_MEDIA = MEDIA_REQUEST_STATUSES.filter(isMediaOpen);

/** A count for one UTC day (`YYYY-MM-DD`), as stored by `date_trunc`. */
export interface DayCount {
  date: string;
  count: number;
}

export interface PopiaAggregates {
  received: number;
  closed: number;
  open: number;
  overdue: number;
  dueSoon: number;
  avgResolutionHours: number | null;
  byStatus: AnalyticsCount<PopiaRequestStatus>[];
  byType: AnalyticsCount<PopiaRequestType>[];
  receivedDaily: DayCount[];
  closedDaily: DayCount[];
}

export interface MediaAggregates {
  received: number;
  approved: number;
  rejected: number;
  open: number;
  awaitingReview: number;
  informationGaps: number;
  avgReviewHours: number | null;
  byStatus: AnalyticsCount<MediaRequestStatus>[];
  receivedDaily: DayCount[];
  approvedDaily: DayCount[];
}

interface PopiaTotalsRow {
  received: number;
  closed: number;
  open: number;
  overdue: number;
  dueSoon: number;
  avgResolutionHours: number | null;
}

interface MediaTotalsRow {
  received: number;
  approved: number;
  rejected: number;
  open: number;
  awaitingReview: number;
  informationGaps: number;
  avgReviewHours: number | null;
}

/**
 * Read-only SQL over the desk tables for the analytics snapshot. State metrics
 * (open/overdue) ignore the window; flow metrics filter by the window's half-open
 * `[from, to)` range. No PII leaves this layer — counts and averages only.
 */
@Injectable()
export class AnalyticsRepository implements OnModuleDestroy {
  private client: Sql | undefined;

  private get sql(): Sql {
    this.client ??= postgres(orDefault("DATABASE_URL", DEFAULT_DATABASE_URL), {
      max: 4,
      onnotice: () => undefined,
    });
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.end();
  }

  async popia(from: Date, to: Date): Promise<PopiaAggregates> {
    const [[totals], byStatus, byType, receivedDaily, closedDaily] = await Promise.all([
      this.sql<PopiaTotalsRow[]>`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= ${from} AND created_at < ${to})::int AS "received",
          COUNT(*) FILTER (WHERE closed_at >= ${from} AND closed_at < ${to})::int AS "closed",
          COUNT(*) FILTER (WHERE status IN ${this.sql(OPEN_POPIA)})::int AS "open",
          COUNT(*) FILTER (
            WHERE status IN ${this.sql(OPEN_POPIA)} AND due_at < now()
          )::int AS "overdue",
          COUNT(*) FILTER (
            WHERE status IN ${this.sql(OPEN_POPIA)}
              AND due_at >= now()
              AND due_at < now() + interval '3 days'
          )::int AS "dueSoon",
          AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600)
            FILTER (WHERE closed_at >= ${from} AND closed_at < ${to})::float AS "avgResolutionHours"
        FROM popia_requests
      `,
      this.sql<AnalyticsCount<PopiaRequestStatus>[]>`
        SELECT status AS key, COUNT(*)::int AS count
        FROM popia_requests
        GROUP BY 1
      `,
      this.sql<AnalyticsCount<PopiaRequestType>[]>`
        SELECT type AS key, COUNT(*)::int AS count
        FROM popia_requests
        WHERE created_at >= ${from} AND created_at < ${to}
        GROUP BY 1
      `,
      this.sql<DayCount[]>`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM popia_requests
        WHERE created_at >= ${from} AND created_at < ${to}
        GROUP BY 1
      `,
      this.sql<DayCount[]>`
        SELECT to_char(date_trunc('day', closed_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM popia_requests
        WHERE closed_at >= ${from} AND closed_at < ${to}
        GROUP BY 1
      `,
    ]);

    return {
      received: totals?.received ?? 0,
      closed: totals?.closed ?? 0,
      open: totals?.open ?? 0,
      overdue: totals?.overdue ?? 0,
      dueSoon: totals?.dueSoon ?? 0,
      avgResolutionHours: totals?.avgResolutionHours ?? null,
      byStatus,
      byType,
      receivedDaily,
      closedDaily,
    };
  }

  async media(from: Date, to: Date): Promise<MediaAggregates> {
    const [[totals], byStatus, receivedDaily, approvedDaily] = await Promise.all([
      this.sql<MediaTotalsRow[]>`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= ${from} AND created_at < ${to})::int AS "received",
          COUNT(*) FILTER (WHERE approved_at >= ${from} AND approved_at < ${to})::int AS "approved",
          COUNT(*) FILTER (
            WHERE status = 'rejected' AND closed_at >= ${from} AND closed_at < ${to}
          )::int AS "rejected",
          COUNT(*) FILTER (WHERE status IN ${this.sql(OPEN_MEDIA)})::int AS "open",
          COUNT(*) FILTER (WHERE status = 'awaiting_review')::int AS "awaitingReview",
          COUNT(*) FILTER (WHERE status = 'information_gap')::int AS "informationGaps",
          AVG(EXTRACT(EPOCH FROM (approved_at - created_at)) / 3600)
            FILTER (WHERE approved_at >= ${from} AND approved_at < ${to})::float AS "avgReviewHours"
        FROM media_requests
      `,
      this.sql<AnalyticsCount<MediaRequestStatus>[]>`
        SELECT status AS key, COUNT(*)::int AS count
        FROM media_requests
        GROUP BY 1
      `,
      this.sql<DayCount[]>`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM media_requests
        WHERE created_at >= ${from} AND created_at < ${to}
        GROUP BY 1
      `,
      this.sql<DayCount[]>`
        SELECT to_char(date_trunc('day', approved_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM media_requests
        WHERE approved_at >= ${from} AND approved_at < ${to}
        GROUP BY 1
      `,
    ]);

    return {
      received: totals?.received ?? 0,
      approved: totals?.approved ?? 0,
      rejected: totals?.rejected ?? 0,
      open: totals?.open ?? 0,
      awaitingReview: totals?.awaitingReview ?? 0,
      informationGaps: totals?.informationGaps ?? 0,
      avgReviewHours: totals?.avgReviewHours ?? null,
      byStatus,
      receivedDaily,
      approvedDaily,
    };
  }
}
