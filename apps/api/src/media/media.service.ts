import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import {
  canTransition,
  extractCitationIds,
  isTerminalStatus,
  toRequestSummary,
  type ApproveMediaRequestInput,
  type CreateMediaNoteInput,
  type MediaAiDraft,
  type MediaDraftSource,
  type MediaEventVisibility,
  type MediaOfficialResponseListResponse,
  type MediaRequestEventView,
  type MediaRequestListResponse,
  type MediaRequestPublic,
  type MediaRequestStaff,
  type MediaRequestStaffDetail,
  type MediaRequestStatus,
  type MediaRequestSummaryListResponse,
  type MediaRequestTracking,
  type RegenerateMediaRequestInput,
  type RejectMediaRequestInput,
  type SubmitMediaRequestInput,
  type UpdateMediaRequestInput,
} from "@voltedge/media-contract";
import { MediaDraftService, type MediaDraftResult } from "./media-draft.service.ts";
import {
  MediaRepository,
  type MediaEventRecord,
  type MediaQueueFilters,
  type MediaRequestPatch,
  type MediaRequestRecord,
  type NewMediaEvent,
  type NewMediaRequest,
} from "./media.repository.ts";

const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_REFERENCE_ATTEMPTS = 5;

export interface MediaQueueQuery {
  status?: MediaRequestStatus;
  /** `"me"`, `"unassigned"`, or a reviewer user id. */
  assigned?: string;
  search?: string;
  limit: number;
  offset: number;
}

/** Query for a requester's own list (`GET /media/requests/mine`). */
export interface MediaMineQuery {
  status?: MediaRequestStatus;
  search?: string;
  limit: number;
  offset: number;
}

/** Query for the official-responses feed (`GET /media/requests/feed`). */
export interface MediaFeedQuery {
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

function toPublicView(record: MediaRequestRecord): MediaRequestPublic {
  return {
    reference: record.reference,
    status: record.status,
    requesterName: record.requesterName,
    claim: record.claim,
    context: record.context,
    outlet: record.outlet,
    approvedResponse: record.approvedResponse,
    approvedSources: record.approvedSources ?? [],
    approvedAt: record.approvedAt?.toISOString() ?? null,
    rejectedReason: record.rejectedReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    closedAt: record.closedAt?.toISOString() ?? null,
  };
}

function toDraftView(record: MediaRequestRecord): MediaAiDraft | null {
  if (!record.aiDraft && !record.aiGap && !record.aiGeneratedAt) return null;
  return {
    text: record.aiDraft,
    sources: record.aiSources ?? [],
    gap: record.aiGap,
    model: record.aiModel,
    generatedAt: record.aiGeneratedAt?.toISOString() ?? null,
  };
}

function toStaffView(record: MediaRequestRecord): MediaRequestStaff {
  return {
    id: record.id,
    ...toPublicView(record),
    requesterEmail: record.requesterEmail,
    requesterId: record.requesterId,
    assignedTo: record.assignedTo,
    assignedToEmail: record.assignedToEmail,
    draft: toDraftView(record),
    reviewerGuidance: record.reviewerGuidance,
  };
}

function toEventView(
  event: MediaEventRecord,
  visibility: MediaEventVisibility,
): MediaRequestEventView {
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
  record: MediaRequestRecord,
  events: MediaEventRecord[],
): MediaRequestStaffDetail {
  return {
    ...toStaffView(record),
    events: events.map((event) => toEventView(event, event.visibility)),
  };
}

function guidanceEvent(
  guidance: string | null,
  actorId: string,
  actorLabel: string,
): NewMediaEvent {
  return {
    kind: "note",
    visibility: "internal",
    actorId,
    actorLabel,
    message: guidance ? `Guidance for Rafiki updated: ${guidance}` : "Guidance for Rafiki cleared.",
  };
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly repo: MediaRepository,
    private readonly drafts: MediaDraftService,
  ) {}

  async submit(input: SubmitMediaRequestInput, user: AuthUser): Promise<MediaRequestPublic> {
    const identity = await this.repo.findUserById(user.id);
    if (!identity) throw new UnauthorizedException("Sign in again to submit a request.");

    const record = await this.insertWithReference(
      {
        requesterName: input.fullName,
        requesterEmail: identity.email,
        requesterId: user.id,
        outlet: input.outlet?.trim() ? input.outlet.trim() : null,
        claim: input.claim,
        context: input.context?.trim() ? input.context.trim() : null,
      },
      {
        kind: "submitted",
        visibility: "requester",
        actorId: user.id,
        actorLabel: "Requester",
        message: null,
        fromStatus: null,
        toStatus: null,
      },
    );

    // Build the response before analysis starts: analyse() mutates the same record.
    const view = toPublicView(record);
    void this.analyse(record);
    return view;
  }

  async listMine(user: AuthUser, query: MediaMineQuery): Promise<MediaRequestSummaryListResponse> {
    const page = await this.repo.listByRequesterId({
      requesterId: user.id,
      status: query.status,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
    return {
      requests: page.requests.map((record) => toRequestSummary(toPublicView(record))),
      total: page.total,
    };
  }

  /** The signed-in media feed: every approved official response, newest first. */
  async listOfficialResponses(query: MediaFeedQuery): Promise<MediaOfficialResponseListResponse> {
    const page = await this.repo.listApproved({ limit: query.limit, offset: query.offset });
    const responses = page.requests.flatMap((record) =>
      record.approvedResponse
        ? [
            {
              reference: record.reference,
              claim: record.claim,
              response: record.approvedResponse,
              sources: record.approvedSources ?? [],
              approvedAt: (record.approvedAt ?? record.updatedAt).toISOString(),
            },
          ]
        : [],
    );
    return { responses, total: page.total };
  }

  async trackForOwner(reference: string, user: AuthUser): Promise<MediaRequestTracking> {
    const record = await this.repo.findByReference(reference);
    if (!record || record.requesterId !== user.id) {
      throw new NotFoundException("Request not found.");
    }
    return this.tracking(record);
  }

  async withdraw(reference: string, user: AuthUser): Promise<MediaRequestPublic> {
    const record = await this.repo.findByReference(reference);
    if (!record || record.requesterId !== user.id) {
      throw new NotFoundException("Request not found.");
    }
    if (!canTransition(record.status, "withdrawn")) {
      throw new BadRequestException(`A ${record.status} request cannot be withdrawn.`);
    }

    await this.repo.applyUpdate(record.id, { status: "withdrawn", closedAt: new Date() }, [
      {
        kind: "status_changed",
        visibility: "requester",
        fromStatus: record.status,
        toStatus: "withdrawn",
        actorId: user.id,
        actorLabel: "Requester",
        message: "Withdrawn by the requester.",
      },
    ]);
    return toPublicView((await this.repo.findByReference(reference)) ?? record);
  }

  async listForStaff(query: MediaQueueQuery, user: AuthUser): Promise<MediaRequestListResponse> {
    const assignedTo =
      query.assigned === undefined
        ? undefined
        : query.assigned === "me"
          ? user.id
          : query.assigned === "unassigned"
            ? null
            : query.assigned;

    const filters: MediaQueueFilters = {
      status: query.status,
      assignedTo,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    };

    const page = await this.repo.listForStaff(filters);
    return { requests: page.requests.map(toStaffView), total: page.total };
  }

  async detail(reference: string): Promise<MediaRequestStaffDetail> {
    const record = await this.repo.findByReference(reference);
    if (!record) throw new NotFoundException("Request not found.");
    const events = await this.repo.listEvents(record.id);
    return toStaffDetail(record, events);
  }

  async update(
    reference: string,
    input: UpdateMediaRequestInput,
    user: AuthUser,
  ): Promise<MediaRequestStaffDetail> {
    const record = await this.repo.findByReference(reference);
    if (!record) throw new NotFoundException("Request not found.");

    const actorLabel = await this.actorLabel(user);
    const patch: MediaRequestPatch = {};
    const events: NewMediaEvent[] = [];
    const note = input.note?.trim() ? input.note.trim() : undefined;

    if (input.status !== undefined && input.status !== record.status) {
      if (input.status === "approved" || input.status === "rejected") {
        throw new BadRequestException(
          `Use the ${input.status === "approved" ? "approve" : "reject"} action to ${input.status === "approved" ? "release a response" : "decline a request"}.`,
        );
      }
      if (!canTransition(record.status, input.status)) {
        throw new BadRequestException(
          `A request cannot move from "${record.status}" to "${input.status}".`,
        );
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

    if (input.guidance !== undefined) {
      const guidance = input.guidance.trim() ? input.guidance.trim() : null;
      if (guidance !== (record.reviewerGuidance ?? null)) {
        patch.reviewerGuidance = guidance;
        events.push(guidanceEvent(guidance, user.id, actorLabel));
      }
    }

    if (Object.keys(patch).length === 0 && events.length === 0) {
      throw new BadRequestException("Nothing to update.");
    }

    await this.repo.applyUpdate(record.id, patch, events);
    return this.detail(reference);
  }

  async regenerate(
    reference: string,
    input: RegenerateMediaRequestInput,
    user: AuthUser,
  ): Promise<MediaRequestStaffDetail> {
    const record = await this.repo.findByReference(reference);
    if (!record) throw new NotFoundException("Request not found.");
    if (record.status === "analysing") {
      throw new BadRequestException("A draft is already being generated for this request.");
    }
    if (isTerminalStatus(record.status)) {
      throw new BadRequestException(`A ${record.status} request cannot be re-analysed.`);
    }

    const actorLabel = await this.actorLabel(user);
    const guidance =
      input.guidance !== undefined
        ? input.guidance.trim()
          ? input.guidance.trim()
          : null
        : record.reviewerGuidance;

    const patch: MediaRequestPatch = { status: "analysing" };
    const events: NewMediaEvent[] = [
      {
        kind: "status_changed",
        visibility: "requester",
        fromStatus: record.status,
        toStatus: "analysing",
        actorId: user.id,
        actorLabel,
        message: "A fresh draft is being prepared.",
      },
    ];
    if (guidance !== record.reviewerGuidance) {
      patch.reviewerGuidance = guidance;
      events.push(guidanceEvent(guidance, user.id, actorLabel));
    }

    await this.repo.applyUpdate(record.id, patch, events);
    void this.generate(record, "analysing", guidance);
    return this.detail(reference);
  }

  async approve(
    reference: string,
    input: ApproveMediaRequestInput,
    user: AuthUser,
  ): Promise<MediaRequestStaffDetail> {
    const record = await this.repo.findByReference(reference);
    if (!record) throw new NotFoundException("Request not found.");
    if (isTerminalStatus(record.status) || !canTransition(record.status, "approved")) {
      throw new BadRequestException(`A ${record.status} request cannot be approved.`);
    }

    const actorLabel = await this.actorLabel(user);
    const now = new Date();
    const note = input.note?.trim() ? input.note.trim() : null;
    const events: NewMediaEvent[] = [
      {
        kind: "status_changed",
        visibility: "requester",
        fromStatus: record.status,
        toStatus: "approved",
        actorId: user.id,
        actorLabel,
        message: note,
      },
      {
        kind: "approved",
        visibility: "requester",
        actorId: user.id,
        actorLabel,
        message: null,
      },
    ];

    await this.repo.applyUpdate(
      record.id,
      {
        status: "approved",
        approvedResponse: input.response,
        approvedSources: this.approvedSources(record, input.response),
        approvedAt: now,
        approvedBy: user.id,
        closedAt: now,
      },
      events,
    );
    return this.detail(reference);
  }

  async reject(
    reference: string,
    input: RejectMediaRequestInput,
    user: AuthUser,
  ): Promise<MediaRequestStaffDetail> {
    const record = await this.repo.findByReference(reference);
    if (!record) throw new NotFoundException("Request not found.");
    if (isTerminalStatus(record.status) || !canTransition(record.status, "rejected")) {
      throw new BadRequestException(`A ${record.status} request cannot be rejected.`);
    }

    const actorLabel = await this.actorLabel(user);
    const now = new Date();
    await this.repo.applyUpdate(
      record.id,
      { status: "rejected", rejectedReason: input.reason, closedAt: now },
      [
        {
          kind: "status_changed",
          visibility: "requester",
          fromStatus: record.status,
          toStatus: "rejected",
          actorId: user.id,
          actorLabel,
          message: null,
        },
        {
          kind: "rejected",
          visibility: "requester",
          actorId: user.id,
          actorLabel,
          message: input.reason,
        },
      ],
    );
    return this.detail(reference);
  }

  async addNote(
    reference: string,
    input: CreateMediaNoteInput,
    user: AuthUser,
  ): Promise<MediaRequestStaffDetail> {
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

  /** Retrieve passages and draft a response, then park the request with reviewers. */
  private async analyse(record: MediaRequestRecord): Promise<void> {
    try {
      await this.repo.applyUpdate(record.id, { status: "analysing" }, [
        {
          kind: "status_changed",
          visibility: "requester",
          fromStatus: "submitted",
          toStatus: "analysing",
          actorLabel: "Rafiki",
          message: null,
        },
      ]);
      await this.generate(record, "analysing");
    } catch (error) {
      await this.generationFailed(record, error);
    }
  }

  private async generate(
    record: MediaRequestRecord,
    from: MediaRequestStatus,
    guidance: string | null = record.reviewerGuidance,
  ): Promise<void> {
    let result: MediaDraftResult;
    try {
      result = await this.drafts.generate(record.claim, record.context, guidance);
    } catch (error) {
      await this.generationFailed(record, error);
      return;
    }

    const status: MediaRequestStatus = result.gap ? "information_gap" : "awaiting_review";
    const summary = result.gap
      ? result.gap
      : `Draft prepared from ${result.sources.length} approved source passage${
          result.sources.length === 1 ? "" : "s"
        }.${guidance?.trim() ? " Reviewer guidance applied." : ""}`;

    try {
      await this.repo.applyUpdate(
        record.id,
        {
          status,
          aiDraft: result.text,
          aiSources: result.sources,
          aiGap: result.gap,
          aiModel: result.model,
          aiGeneratedAt: new Date(),
        },
        [
          {
            kind: "draft_generated",
            visibility: "internal",
            actorLabel: "Rafiki",
            message: summary,
          },
          {
            kind: "status_changed",
            visibility: "requester",
            fromStatus: from,
            toStatus: status,
            actorLabel: "Rafiki",
            message: null,
          },
        ],
      );
    } catch (error) {
      this.logger.error(
        `Could not store the draft for ${record.reference}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async generationFailed(record: MediaRequestRecord, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Draft generation failed for ${record.reference}: ${message}`);
    try {
      await this.repo.applyUpdate(
        record.id,
        {
          status: "information_gap",
          aiGap: `Draft generation unavailable: ${message}`,
          aiGeneratedAt: new Date(),
        },
        [
          {
            kind: "draft_generated",
            visibility: "internal",
            actorLabel: "Rafiki",
            message: `Draft generation unavailable: ${message}`,
          },
          {
            kind: "status_changed",
            visibility: "requester",
            fromStatus: "analysing",
            toStatus: "information_gap",
            actorLabel: "Rafiki",
            message: null,
          },
        ],
      );
    } catch (storingError) {
      this.logger.error(
        `Could not record the generation failure for ${record.reference}: ${
          storingError instanceof Error ? storingError.message : String(storingError)
        }`,
      );
    }
  }

  private approvedSources(record: MediaRequestRecord, response: string): MediaDraftSource[] {
    const pool = record.aiSources ?? [];
    const cited = new Set(extractCitationIds(response));
    const matched = pool.filter((source) => cited.has(source.chunkId));
    return matched.length > 0 ? matched : pool;
  }

  private async tracking(record: MediaRequestRecord): Promise<MediaRequestTracking> {
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
    input: Omit<NewMediaRequest, "id" | "reference">,
    event: NewMediaEvent,
  ): Promise<MediaRequestRecord> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const request: NewMediaRequest = { id: randomUUID(), reference: this.reference(), ...input };
      try {
        return await this.repo.insertRequestWithEvent(request, event);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        lastError = error;
      }
    }
    throw new Error(
      `Could not allocate a unique media reference after ${MAX_REFERENCE_ATTEMPTS} attempts.`,
      { cause: lastError },
    );
  }

  private reference(): string {
    const bytes = randomBytes(6);
    let code = "";
    for (const byte of bytes) code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
    return `MEDIA-${new Date().getUTCFullYear()}-${code}`;
  }

  private async actorLabel(user: AuthUser): Promise<string> {
    const identity = await this.repo.findUserById(user.id);
    return identity?.email ?? `Stats SA ${user.role}`;
  }
}
