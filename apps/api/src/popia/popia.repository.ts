import { randomUUID } from "node:crypto";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type {
  PopiaEventKind,
  PopiaEventVisibility,
  PopiaRequestStatus,
  PopiaRequestType,
} from "@voltedge/popia-contract";
import postgres, { type Sql } from "postgres";
import { orDefault } from "../env.ts";

const DEFAULT_DATABASE_URL = "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth";

export interface PopiaRequestRecord {
  id: string;
  reference: string;
  type: PopiaRequestType;
  status: PopiaRequestStatus;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string | null;
  requesterId: string | null;
  details: string;
  desiredOutcome: string | null;
  resolution: string | null;
  assignedTo: string | null;
  assignedToEmail: string | null;
  dueAt: Date;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export interface PopiaEventRecord {
  id: string;
  kind: PopiaEventKind;
  visibility: PopiaEventVisibility;
  fromStatus: PopiaRequestStatus | null;
  toStatus: PopiaRequestStatus | null;
  actorId: string | null;
  actorLabel: string;
  message: string | null;
  createdAt: Date;
}

export interface NewPopiaRequest {
  id: string;
  reference: string;
  type: PopiaRequestType;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string | null;
  requesterId: string | null;
  details: string;
  desiredOutcome: string | null;
  dueAt: Date;
}

export interface NewPopiaEvent {
  kind: PopiaEventKind;
  visibility: PopiaEventVisibility;
  fromStatus?: PopiaRequestStatus | null;
  toStatus?: PopiaRequestStatus | null;
  actorId?: string | null;
  actorLabel: string;
  message?: string | null;
}

export interface PopiaRequestPatch {
  status?: PopiaRequestStatus;
  resolution?: string | null;
  assignedTo?: string | null;
  closedAt?: Date | null;
}

export interface StaffRequestFilters {
  status?: PopiaRequestStatus;
  type?: PopiaRequestType;
  /** A user id to match, or null for unassigned. */
  assignedTo?: string | null;
  search?: string;
  limit: number;
  offset: number;
}

export interface StaffRequestPage {
  requests: PopiaRequestRecord[];
  total: number;
}

export interface UserIdentity {
  id: string;
  email: string;
}

type StaffRow = PopiaRequestRecord & { total: number };

const REQUEST_COLUMNS = `
  r.id, r.reference, r.type, r.status,
  r.requester_name AS "requesterName", r.requester_email AS "requesterEmail",
  r.requester_phone AS "requesterPhone", r.requester_id AS "requesterId",
  r.details, r.desired_outcome AS "desiredOutcome", r.resolution,
  r.assigned_to AS "assignedTo", u.email AS "assignedToEmail",
  r.due_at AS "dueAt", r.created_at AS "createdAt", r.updated_at AS "updatedAt",
  r.closed_at AS "closedAt"
`;

const EVENT_COLUMNS = `
  id, kind, visibility,
  from_status AS "fromStatus", to_status AS "toStatus",
  actor_id AS "actorId", actor_label AS "actorLabel", message,
  created_at AS "createdAt"
`;

@Injectable()
export class PopiaRepository implements OnModuleDestroy {
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
    request: NewPopiaRequest,
    event: NewPopiaEvent,
  ): Promise<PopiaRequestRecord> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx<PopiaRequestRecord[]>`
        INSERT INTO popia_requests (
          id, reference, type, status, requester_name, requester_email, requester_phone,
          requester_id, details, desired_outcome, due_at
        )
        VALUES (
          ${request.id}, ${request.reference}, ${request.type}, 'submitted',
          ${request.requesterName}, ${request.requesterEmail}, ${request.requesterPhone},
          ${request.requesterId}, ${request.details}, ${request.desiredOutcome}, ${request.dueAt}
        )
        RETURNING
          id, reference, type, status,
          requester_name AS "requesterName", requester_email AS "requesterEmail",
          requester_phone AS "requesterPhone", requester_id AS "requesterId",
          details, desired_outcome AS "desiredOutcome", resolution,
          assigned_to AS "assignedTo", NULL::text AS "assignedToEmail",
          due_at AS "dueAt", created_at AS "createdAt", updated_at AS "updatedAt",
          closed_at AS "closedAt"
      `;
      if (!row) throw new Error("insert returned no POPIA request");

      await this.insertEventWith(tx as unknown as Sql, row.id, event);
      return row;
    });
  }

  async insertEvent(requestId: string, event: NewPopiaEvent): Promise<PopiaEventRecord> {
    return this.insertEventWith(this.sql, requestId, event);
  }

  private async insertEventWith(
    sql: Sql,
    requestId: string,
    event: NewPopiaEvent,
  ): Promise<PopiaEventRecord> {
    const [row] = await sql<PopiaEventRecord[]>`
      INSERT INTO popia_request_events (
        id, request_id, kind, visibility, from_status, to_status, actor_id, actor_label, message
      )
      VALUES (
        ${randomUUID()}, ${requestId}, ${event.kind}, ${event.visibility},
        ${event.fromStatus ?? null}, ${event.toStatus ?? null},
        ${event.actorId ?? null}, ${event.actorLabel}, ${event.message ?? null}
      )
      RETURNING ${sql.unsafe(EVENT_COLUMNS)}
    `;
    if (!row) throw new Error("insert returned no POPIA event");
    return row;
  }

  async findByReference(reference: string): Promise<PopiaRequestRecord | undefined> {
    const [row] = await this.sql<PopiaRequestRecord[]>`
      SELECT ${this.sql.unsafe(REQUEST_COLUMNS)}
      FROM popia_requests r
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE r.reference = ${reference}
    `;
    return row;
  }

  async findForRequester(
    reference: string,
    email: string,
  ): Promise<PopiaRequestRecord | undefined> {
    const [row] = await this.sql<PopiaRequestRecord[]>`
      SELECT ${this.sql.unsafe(REQUEST_COLUMNS)}
      FROM popia_requests r
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE r.reference = ${reference} AND lower(r.requester_email) = lower(${email})
    `;
    return row;
  }

  async listByRequesterId(userId: string): Promise<PopiaRequestRecord[]> {
    return this.sql<PopiaRequestRecord[]>`
      SELECT ${this.sql.unsafe(REQUEST_COLUMNS)}
      FROM popia_requests r
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE r.requester_id = ${userId}
      ORDER BY r.created_at DESC
    `;
  }

  async listForStaff(filters: StaffRequestFilters): Promise<StaffRequestPage> {
    const conditions = [this.sql`true`];
    if (filters.status) conditions.push(this.sql`r.status = ${filters.status}`);
    if (filters.type) conditions.push(this.sql`r.type = ${filters.type}`);
    if (filters.assignedTo === null) conditions.push(this.sql`r.assigned_to IS NULL`);
    else if (filters.assignedTo) conditions.push(this.sql`r.assigned_to = ${filters.assignedTo}`);
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        this
          .sql`(r.reference ILIKE ${pattern} OR r.requester_name ILIKE ${pattern} OR r.requester_email ILIKE ${pattern})`,
      );
    }
    const where = conditions.reduce((query, condition) => this.sql`${query} AND ${condition}`);

    const rows = await this.sql<StaffRow[]>`
      SELECT ${this.sql.unsafe(REQUEST_COLUMNS)}, COUNT(*) OVER()::int AS total
      FROM popia_requests r
      LEFT JOIN users u ON u.id = r.assigned_to
      WHERE ${where}
      ORDER BY (r.status IN ('completed', 'rejected', 'withdrawn')) ASC, r.due_at ASC, r.created_at DESC
      LIMIT ${filters.limit} OFFSET ${filters.offset}
    `;

    return {
      requests: rows.map(({ total: _total, ...request }) => request),
      total: rows[0]?.total ?? 0,
    };
  }

  async listEvents(requestId: string): Promise<PopiaEventRecord[]> {
    return this.sql<PopiaEventRecord[]>`
      SELECT ${this.sql.unsafe(EVENT_COLUMNS)}
      FROM popia_request_events
      WHERE request_id = ${requestId}
      ORDER BY seq ASC
    `;
  }

  /** Apply a patch and append its timeline entries in one transaction. */
  async applyUpdate(
    requestId: string,
    patch: PopiaRequestPatch,
    events: NewPopiaEvent[],
  ): Promise<void> {
    const columns: Record<keyof PopiaRequestPatch, string> = {
      status: "status",
      resolution: "resolution",
      assignedTo: "assigned_to",
      closedAt: "closed_at",
    };
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      update[columns[key as keyof PopiaRequestPatch]] = value;
    }
    update.updated_at = new Date();

    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE popia_requests
        SET ${tx(update, ...Object.keys(update))}
        WHERE id = ${requestId}
      `;
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
