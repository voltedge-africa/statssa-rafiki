import { randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import {
  POPIA_RESPONSE_WINDOW_DAYS,
  canTransition,
  isTerminalStatus,
  type CreatePopiaNoteInput,
  type PopiaEventVisibility,
  type PopiaRequestEventView,
  type PopiaRequestListResponse,
  type PopiaRequestPublic,
  type PopiaRequestStaff,
  type PopiaRequestStaffDetail,
  type PopiaRequestStatus,
  type PopiaRequestTracking,
  type PopiaRequestType,
  type SubmitPopiaRequestInput,
  type TrackPopiaRequestInput,
  type UpdatePopiaRequestInput,
} from "@voltedge/popia-contract";
import {
  PopiaRepository,
  type NewPopiaEvent,
  type NewPopiaRequest,
  type PopiaEventRecord,
  type PopiaRequestPatch,
  type PopiaRequestRecord,
  type StaffRequestFilters,
} from "./popia.repository.ts";

const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_REFERENCE_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface QueueQuery {
  status?: PopiaRequestStatus;
  type?: PopiaRequestType;
  /** `"me"`, `"unassigned"`, or a case-worker user id. */
  assigned?: string;
  search?: string;
  limit: number;
  offset: number;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function toPublicView(record: PopiaRequestRecord): PopiaRequestPublic {
  return {
    reference: record.reference,
    type: record.type,
    status: record.status,
    requesterName: record.requesterName,
    details: record.details,
    desiredOutcome: record.desiredOutcome,
    resolution: record.resolution,
    dueAt: record.dueAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    closedAt: record.closedAt?.toISOString() ?? null,
  };
}

function toStaffView(record: PopiaRequestRecord): PopiaRequestStaff {
  return {
    id: record.id,
    ...toPublicView(record),
    requesterEmail: record.requesterEmail,
    requesterPhone: record.requesterPhone,
    requesterId: record.requesterId,
    assignedTo: record.assignedTo,
    assignedToEmail: record.assignedToEmail,
  };
}

function toEventView(
  event: PopiaEventRecord,
  visibility: PopiaEventVisibility,
): PopiaRequestEventView {
  return {
    id: event.id,
    kind: event.kind,
    visibility,
    message: event.message,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actorLabel: event.actorLabel,
    createdAt: event.createdAt.toISOString(),
  };
}

function toStaffDetail(
  record: PopiaRequestRecord,
  events: PopiaEventRecord[],
): PopiaRequestStaffDetail {
  return {
    ...toStaffView(record),
    events: events.map((event) => toEventView(event, event.visibility)),
  };
}

@Injectable()
export class PopiaService {
  constructor(private readonly repo: PopiaRepository) {}

  async submit(input: SubmitPopiaRequestInput, user?: AuthUser): Promise<PopiaRequestPublic> {
    const now = Date.now();
    const record = await this.insertWithReference(
      {
        type: input.type,
        requesterName: input.fullName,
        requesterEmail: input.email,
        requesterPhone: input.phone?.trim() ? input.phone.trim() : null,
        requesterId: user?.id ?? null,
        details: input.details,
        desiredOutcome: input.desiredOutcome?.trim() ? input.desiredOutcome.trim() : null,
        dueAt: new Date(now + POPIA_RESPONSE_WINDOW_DAYS * DAY_MS),
      },
      {
        kind: "submitted",
        visibility: "requester",
        actorId: user?.id ?? null,
        actorLabel: "Requester",
        message: null,
        fromStatus: null,
        toStatus: null,
      },
    );
    return toPublicView(record);
  }

  async track(input: TrackPopiaRequestInput): Promise<PopiaRequestTracking> {
    const record = await this.repo.findForRequester(input.reference, input.email);
    if (!record) {
      throw new NotFoundException("No request matches that reference and email address.");
    }
    return this.tracking(record);
  }

  async listMine(user: AuthUser): Promise<PopiaRequestTracking[]> {
    const records = await this.repo.listByRequesterId(user.id);
    return Promise.all(records.map((record) => this.tracking(record)));
  }

  async listForStaff(query: QueueQuery, user: AuthUser): Promise<PopiaRequestListResponse> {
    const assignedTo =
      query.assigned === undefined
        ? undefined
        : query.assigned === "me"
          ? user.id
          : query.assigned === "unassigned"
            ? null
            : query.assigned;

    const filters: StaffRequestFilters = {
      status: query.status,
      type: query.type,
      assignedTo,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    };

    const page = await this.repo.listForStaff(filters);
    return { requests: page.requests.map(toStaffView), total: page.total };
  }

  async detail(reference: string): Promise<PopiaRequestStaffDetail> {
    const record = await this.repo.findByReference(reference);
    if (!record) throw new NotFoundException("Request not found.");
    const events = await this.repo.listEvents(record.id);
    return toStaffDetail(record, events);
  }

  async update(
    reference: string,
    input: UpdatePopiaRequestInput,
    user: AuthUser,
  ): Promise<PopiaRequestStaffDetail> {
    const record = await this.repo.findByReference(reference);
    if (!record) throw new NotFoundException("Request not found.");

    const actorLabel = await this.actorLabel(user);
    const patch: PopiaRequestPatch = {};
    const events: NewPopiaEvent[] = [];
    const note = input.note?.trim() ? input.note.trim() : undefined;

    if (input.resolution !== undefined) {
      const resolution = input.resolution?.trim() ? input.resolution.trim() : null;
      if (resolution !== record.resolution) {
        patch.resolution = resolution;
        if (resolution) {
          events.push({
            kind: "resolution",
            visibility: "requester",
            actorId: user.id,
            actorLabel,
            message: resolution,
          });
        }
      }
    }

    if (input.status !== undefined && input.status !== record.status) {
      if (!canTransition(record.status, input.status)) {
        throw new BadRequestException(
          `A request cannot move from "${record.status}" to "${input.status}".`,
        );
      }
      if (
        (input.status === "completed" || input.status === "rejected") &&
        !(patch.resolution ?? record.resolution)
      ) {
        throw new BadRequestException("Add a resolution before completing or rejecting a request.");
      }
      patch.status = input.status;
      if (isTerminalStatus(input.status)) patch.closedAt = new Date();
      events.push({
        kind: "status_changed",
        visibility: "requester",
        fromStatus: record.status,
        toStatus: input.status,
        actorId: user.id,
        actorLabel,
        message: note ?? null,
      });
    } else if (note) {
      events.push({
        kind: "note",
        visibility: "requester",
        actorId: user.id,
        actorLabel,
        message: note,
      });
    }

    if (input.assignedTo !== undefined) {
      let assignedTo: string | null;
      if (!input.assignedTo) {
        assignedTo = null;
      } else if (input.assignedTo === "me") {
        assignedTo = user.id;
      } else {
        const assignee = await this.repo.findUserByEmail(input.assignedTo);
        if (!assignee) {
          throw new BadRequestException(`No user with the email "${input.assignedTo}".`);
        }
        assignedTo = assignee.id;
      }

      if (assignedTo !== record.assignedTo) {
        patch.assignedTo = assignedTo;
        events.push({
          kind: "assigned",
          visibility: "internal",
          actorId: user.id,
          actorLabel,
          message: assignedTo
            ? `Assigned to ${assignedTo === user.id ? actorLabel : input.assignedTo}.`
            : "Unassigned.",
        });
      }
    }

    if (Object.keys(patch).length === 0 && events.length === 0) {
      throw new BadRequestException("Nothing to update.");
    }

    await this.repo.applyUpdate(record.id, patch, events);
    return this.detail(reference);
  }

  async addNote(
    reference: string,
    input: CreatePopiaNoteInput,
    user: AuthUser,
  ): Promise<PopiaRequestStaffDetail> {
    const record = await this.repo.findByReference(reference);
    if (!record) throw new NotFoundException("Request not found.");

    await this.repo.insertEvent(record.id, {
      kind: "note",
      visibility: input.visibility,
      actorId: user.id,
      actorLabel: await this.actorLabel(user),
      message: input.message,
    });
    return this.detail(reference);
  }

  private async tracking(record: PopiaRequestRecord): Promise<PopiaRequestTracking> {
    const events = await this.repo.listEvents(record.id);
    return {
      ...toPublicView(record),
      events: events
        .filter((event) => event.visibility === "requester")
        .map((event) => ({
          ...toEventView(event, "requester"),
          actorLabel: event.kind === "submitted" ? "Requester" : "Stats SA",
        })),
    };
  }

  private async insertWithReference(
    input: Omit<NewPopiaRequest, "id" | "reference">,
    event: NewPopiaEvent,
  ): Promise<PopiaRequestRecord> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const request: NewPopiaRequest = { id: randomUUID(), reference: this.reference(), ...input };
      try {
        return await this.repo.insertRequestWithEvent(request, event);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        lastError = error;
      }
    }
    throw new Error(
      `Could not allocate a unique POPIA reference after ${MAX_REFERENCE_ATTEMPTS} attempts.`,
      { cause: lastError },
    );
  }

  private reference(): string {
    const bytes = randomBytes(6);
    let code = "";
    for (const byte of bytes) code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
    return `POPIA-${new Date().getUTCFullYear()}-${code}`;
  }

  private async actorLabel(user: AuthUser): Promise<string> {
    const identity = await this.repo.findUserById(user.id);
    return identity?.email ?? `Stats SA ${user.role}`;
  }
}
