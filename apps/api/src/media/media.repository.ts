import { randomUUID } from "node:crypto";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type {
  MediaDraftSource,
  MediaEventKind,
  MediaEventVisibility,
  MediaRequestStatus,
} from "@voltedge/media-contract";
import postgres, { type Sql } from "postgres";
import { orDefault } from "../env.ts";

const DEFAULT_DATABASE_URL = "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth";

export interface MediaRequestRecord {
  id: string;
  reference: string;
  status: MediaRequestStatus;
  requesterName: string;
  requesterEmail: string;
  requesterId: string | null;
  outlet: string | null;
  claim: string;
  context: string | null;
  reviewerGuidance: string | null;
  aiDraft: string | null;
  aiSources: MediaDraftSource[] | null;
  aiGap: string | null;
  aiModel: string | null;
  aiGeneratedAt: Date | null;
  approvedResponse: string | null;
  approvedSources: MediaDraftSource[] | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedReason: string | null;
  assignedTo: string | null;
  assignedToEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export interface MediaEventRecord {
  id: string;
  kind: MediaEventKind;
  visibility: MediaEventVisibility;
  fromStatus: MediaRequestStatus | null;
  toStatus: MediaRequestStatus | null;
  actorId: string | null;
  actorLabel: string;
  message: string | null;
  createdAt: Date;
}

export interface NewMediaRequest {
  id: string;
  reference: string;
  requesterName: string;
  requesterEmail: string;
  requesterId: string | null;
  outlet: string | null;
  claim: string;
  context: string | null;
}

export interface NewMediaEvent {
  kind: MediaEventKind;
  visibility: MediaEventVisibility;
  fromStatus?: MediaRequestStatus | null;
  toStatus?: MediaRequestStatus | null;
  actorId?: string | null;
  actorLabel: string;
  message?: string | null;
}

export interface MediaRequestPatch {
  status?: MediaRequestStatus;
  assignedTo?: string | null;
  closedAt?: Date | null;
  reviewerGuidance?: string | null;
  aiDraft?: string | null;
  aiSources?: MediaDraftSource[] | null;
  aiGap?: string | null;
  aiModel?: string | null;
  aiGeneratedAt?: Date | null;
  approvedResponse?: string | null;
  approvedSources?: MediaDraftSource[] | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  rejectedReason?: string | null;
}

export interface MediaQueueFilters {
  status?: MediaRequestStatus;
  /** A user id to match, or null for unassigned. */
  assignedTo?: string | null;
  search?: string;
  limit: number;
  offset: number;
}

/** Filters for a requester's own list (`GET /media/requests/mine`). */
export interface MediaOwnerFilters {
  requesterId: string;
  status?: MediaRequestStatus;
  search?: string;
  limit: number;
  offset: number;
}

/** Filters for the official-responses feed (`GET /media/requests/feed`). */
export interface MediaFeedFilters {
  limit: number;
  offset: number;
}

export interface MediaQueuePage {
  requests: MediaRequestRecord[];
  total: number;
}

export interface UserIdentity {
  id: string;
  email: string;
}

type StaffRow = MediaRequestRecord & { total: number };

/** postgres.js serialises jsonb through its own JSONValue type. */
function toJson(value: MediaDraftSource[]): postgres.JSONValue {
  return value as unknown as postgres.JSONValue;
}

const REQUEST_COLUMNS = `
  r.id, r.reference, r.status,
  r.requester_name AS "requesterName", r.requester_email AS "requesterEmail",
  r.requester_id AS "requesterId", r.outlet, r.claim, r.context,
  r.reviewer_guidance AS "reviewerGuidance",
  r.ai_draft AS "aiDraft", r.ai_sources AS "aiSources", r.ai_gap AS "aiGap",
  r.ai_model AS "aiModel", r.ai_generated_at AS "aiGeneratedAt",
  r.approved_response AS "approvedResponse", r.approved_sources AS "approvedSources",
  r.approved_at AS "approvedAt", r.approved_by AS "approvedBy",
  r.rejected_reason AS "rejectedReason",
  r.assigned_to AS "assignedTo", u.email AS "assignedToEmail",
  r.created_at AS "createdAt", r.updated_at AS "updatedAt", r.closed_at AS "closedAt"
`;

const RETURNING_COLUMNS = `
  id, reference, status,
  requester_name AS "requesterName", requester_email AS "requesterEmail",
  requester_id AS "requesterId", outlet, claim, context,
  reviewer_guidance AS "reviewerGuidance",
  ai_draft AS "aiDraft", ai_sources AS "aiSources", ai_gap AS "aiGap",
  ai_model AS "aiModel", ai_generated_at AS "aiGeneratedAt",
  approved_response AS "approvedResponse", approved_sources AS "approvedSources",
  approved_at AS "approvedAt", approved_by AS "approvedBy",
  rejected_reason AS "rejectedReason",
  assigned_to AS "assignedTo", NULL::text AS "assignedToEmail",
  created_at AS "createdAt", updated_at AS "updatedAt", closed_at AS "closedAt"
`;

const EVENT_COLUMNS = `
  id, kind, visibility,
  from_status AS "fromStatus", to_status AS "toStatus",
  actor_id AS "actorId", actor_label AS "actorLabel", message,
  created_at AS "createdAt"
`;

@Injectable()
export class MediaRepository implements OnModuleDestroy {
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

  async insertRequestWithEvent(
    request: NewMediaRequest,
    event: NewMediaEvent,
  ): Promise<MediaRequestRecord> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx<MediaRequestRecord[]>`
        INSERT INTO media_requests (
          id, reference, status, requester_name, requester_email, requester_id,
          outlet, claim, context
        )
        VALUES (
          ${request.id}, ${request.reference}, 'submitted',
          ${request.requesterName}, ${request.requesterEmail}, ${request.requesterId},
          ${request.outlet}, ${request.claim}, ${request.context}
        )
        RETURNING ${tx.unsafe(RETURNING_COLUMNS)}
      `;
      if (!row) throw new Error("insert returned no media request");

      await this.insertEventWith(tx as unknown as Sql, row.id, event);
      return row;
    });
  }

  async insertEvent(requestId: string, event: NewMediaEvent): Promise<MediaEventRecord> {
    return this.insertEventWith(this.sql, requestId, event);
  }

  private async insertEventWith(
    sql: Sql,
    requestId: string,
    event: NewMediaEvent,
  ): Promise<MediaEventRecord> {
    const [row] = await sql<MediaEventRecord[]>`
      INSERT INTO media_request_events (
        id, request_id, kind, visibility, from_status, to_status, actor_id, actor_label, message
      )
      VALUES (
        ${randomUUID()}, ${requestId}, ${event.kind}, ${event.visibility},
        ${event.fromStatus ?? null}, ${event.toStatus ?? null},
        ${event.actorId ?? null}, ${event.actorLabel}, ${event.message ?? null}
      )
      RETURNING ${sql.unsafe(EVENT_COLUMNS)}
    `;
    if (!row) throw new Error("insert returned no media event");
    return row;
  }

  async findByReference(reference: string): Promise<MediaRequestRecord | undefined> {
    const [row] = await this.sql<MediaRequestRecord[]>`
      SELECT ${this.sql.unsafe(REQUEST_COLUMNS)}
      FROM media_requests r
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE r.reference = ${reference}
    `;
    return row;
  }

  async listByRequesterId(filters: MediaOwnerFilters): Promise<MediaQueuePage> {
    const conditions = [this.sql`r.requester_id = ${filters.requesterId}`];
    if (filters.status) conditions.push(this.sql`r.status = ${filters.status}`);
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(this.sql`(r.reference ILIKE ${pattern} OR r.claim ILIKE ${pattern})`);
    }
    const where = conditions.reduce((query, condition) => this.sql`${query} AND ${condition}`);

    const rows = await this.sql<StaffRow[]>`
      SELECT ${this.sql.unsafe(REQUEST_COLUMNS)}, COUNT(*) OVER()::int AS total
      FROM media_requests r
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ${filters.limit} OFFSET ${filters.offset}
    `;

    return {
      requests: rows.map(({ total: _total, ...request }) => request),
      total: rows[0]?.total ?? 0,
    };
  }

  /** Approved responses for the signed-in media feed, newest approval first. */
  async listApproved(filters: MediaFeedFilters): Promise<MediaQueuePage> {
    const rows = await this.sql<StaffRow[]>`
      SELECT ${this.sql.unsafe(REQUEST_COLUMNS)}, COUNT(*) OVER()::int AS total
      FROM media_requests r
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE r.status = 'approved' AND r.approved_response IS NOT NULL
      ORDER BY r.approved_at DESC NULLS LAST, r.created_at DESC
      LIMIT ${filters.limit} OFFSET ${filters.offset}
    `;

    return {
      requests: rows.map(({ total: _total, ...request }) => request),
      total: rows[0]?.total ?? 0,
    };
  }

  async listForStaff(filters: MediaQueueFilters): Promise<MediaQueuePage> {
    const conditions = [this.sql`true`];
    if (filters.status) conditions.push(this.sql`r.status = ${filters.status}`);
    if (filters.assignedTo === null) conditions.push(this.sql`r.assigned_to IS NULL`);
    else if (filters.assignedTo) conditions.push(this.sql`r.assigned_to = ${filters.assignedTo}`);
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        this
          .sql`(r.reference ILIKE ${pattern} OR r.requester_name ILIKE ${pattern} OR r.requester_email ILIKE ${pattern} OR r.claim ILIKE ${pattern})`,
      );
    }
    const where = conditions.reduce((query, condition) => this.sql`${query} AND ${condition}`);

    const rows = await this.sql<StaffRow[]>`
      SELECT ${this.sql.unsafe(REQUEST_COLUMNS)}, COUNT(*) OVER()::int AS total
      FROM media_requests r
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE ${where}
      ORDER BY (r.status IN ('approved', 'rejected', 'withdrawn')) ASC, r.created_at DESC
      LIMIT ${filters.limit} OFFSET ${filters.offset}
    `;

    return {
      requests: rows.map(({ total: _total, ...request }) => request),
      total: rows[0]?.total ?? 0,
    };
  }

  async listEvents(requestId: string): Promise<MediaEventRecord[]> {
    return this.sql<MediaEventRecord[]>`
      SELECT ${this.sql.unsafe(EVENT_COLUMNS)}
      FROM media_request_events
      WHERE request_id = ${requestId}
      ORDER BY seq ASC
    `;
  }

  /** Apply a patch and append its timeline entries in one transaction. */
  async applyUpdate(
    requestId: string,
    patch: MediaRequestPatch,
    events: NewMediaEvent[],
  ): Promise<void> {
    const columns: Partial<Record<keyof MediaRequestPatch, string>> = {
      status: "status",
      assignedTo: "assigned_to",
      closedAt: "closed_at",
      reviewerGuidance: "reviewer_guidance",
      aiDraft: "ai_draft",
      aiGap: "ai_gap",
      aiModel: "ai_model",
      aiGeneratedAt: "ai_generated_at",
      approvedResponse: "approved_response",
      approvedAt: "approved_at",
      approvedBy: "approved_by",
      rejectedReason: "rejected_reason",
    };
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const column = columns[key as keyof MediaRequestPatch];
      if (column) update[column] = value;
    }
    update.updated_at = new Date();

    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE media_requests
        SET ${tx(update, ...Object.keys(update))}
        WHERE id = ${requestId}
      `;

      // jsonb columns need explicit JSON encoding; the generic patch helper above
      // would treat these arrays as Postgres arrays.
      if (patch.aiSources !== undefined) {
        await tx`
          UPDATE media_requests
          SET ai_sources = ${patch.aiSources === null ? null : tx.json(toJson(patch.aiSources))}
          WHERE id = ${requestId}
        `;
      }
      if (patch.approvedSources !== undefined) {
        await tx`
          UPDATE media_requests
          SET approved_sources = ${patch.approvedSources === null ? null : tx.json(toJson(patch.approvedSources))}
          WHERE id = ${requestId}
        `;
      }

      for (const event of events) {
        await this.insertEventWith(tx as unknown as Sql, requestId, event);
      }
    });
  }

  async findUserByEmail(email: string): Promise<UserIdentity | undefined> {
    const [row] = await this.sql<UserIdentity[]>`
      SELECT id, email FROM users WHERE lower(email) = lower(${email})
    `;
    return row;
  }

  async findUserById(id: string): Promise<UserIdentity | undefined> {
    const [row] = await this.sql<UserIdentity[]>`SELECT id, email FROM users WHERE id = ${id}`;
    return row;
  }
}
