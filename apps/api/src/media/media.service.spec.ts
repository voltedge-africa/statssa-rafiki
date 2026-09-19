import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { GovernanceService } from "../admin/governance.service.ts";
import type { GapsLabellingService } from "../gaps/gaps.labelling.service.ts";
import type { GapsService } from "../gaps/gaps.service.ts";
import type { MediaDraftResult } from "./media-draft.service.ts";
import { MediaDraftService } from "./media-draft.service.ts";
import { MediaService } from "./media.service.ts";
import type {
  MediaEventRecord,
  MediaFeedFilters,
  MediaOwnerFilters,
  MediaQueueFilters,
  MediaQueuePage,
  MediaRequestPatch,
  MediaRequestRecord,
  NewMediaEvent,
  NewMediaRequest,
  UserIdentity,
} from "./media.repository.ts";
import { MediaRepository } from "./media.repository.ts";

class FakeRepository {
  requests: MediaRequestRecord[] = [];
  events = new Map<string, MediaEventRecord[]>();
  users: UserIdentity[] = [];
  duplicateReferences = new Set<string>();
  #seq = 1;

  async insertRequestWithEvent(
    request: NewMediaRequest,
    event: NewMediaEvent,
  ): Promise<MediaRequestRecord> {
    if (this.duplicateReferences.has(request.reference)) {
      throw Object.assign(new Error("duplicate key"), { code: "23505" });
    }
    const now = new Date();
    const record: MediaRequestRecord = {
      ...request,
      status: "submitted",
      reviewerGuidance: null,
      aiDraft: null,
      aiSources: null,
      aiGap: null,
      aiModel: null,
      aiGeneratedAt: null,
      approvedResponse: null,
      approvedSources: null,
      approvedAt: null,
      approvedBy: null,
      rejectedReason: null,
      assignedTo: null,
      assignedToEmail: null,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    this.requests.push(record);
    await this.insertEvent(record.id, event);
    return record;
  }

  async insertEvent(requestId: string, event: NewMediaEvent): Promise<MediaEventRecord> {
    const record: MediaEventRecord = {
      id: `event-${this.#seq++}`,
      kind: event.kind,
      visibility: event.visibility,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      actorId: event.actorId ?? null,
      actorLabel: event.actorLabel,
      message: event.message ?? null,
      createdAt: new Date(),
    };
    const list = this.events.get(requestId) ?? [];
    list.push(record);
    this.events.set(requestId, list);
    return record;
  }

  async findByReference(reference: string): Promise<MediaRequestRecord | undefined> {
    return this.requests.find((request) => request.reference === reference);
  }

  async listByRequesterId(filters: MediaOwnerFilters): Promise<MediaQueuePage> {
    const matching = this.requests.filter((request) => {
      if (request.requesterId !== filters.requesterId) return false;
      if (filters.status && request.status !== filters.status) return false;
      if (filters.search) {
        const needle = filters.search.toLowerCase();
        const hit =
          request.reference.toLowerCase().includes(needle) ||
          request.claim.toLowerCase().includes(needle);
        if (!hit) return false;
      }
      return true;
    });
    return {
      requests: matching.slice(filters.offset, filters.offset + filters.limit),
      total: matching.length,
    };
  }

  async listApproved(filters: MediaFeedFilters): Promise<MediaQueuePage> {
    const matching = this.requests
      .filter((request) => request.status === "approved")
      .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0));
    return {
      requests: matching.slice(filters.offset, filters.offset + filters.limit),
      total: matching.length,
    };
  }

  async listForStaff(filters: MediaQueueFilters): Promise<MediaQueuePage> {
    const matching = this.requests.filter((request) => {
      if (filters.status && request.status !== filters.status) return false;
      if (filters.assignedTo === null && request.assignedTo !== null) return false;
      if (typeof filters.assignedTo === "string" && request.assignedTo !== filters.assignedTo) {
        return false;
      }
      return true;
    });
    return {
      requests: matching.slice(filters.offset, filters.offset + filters.limit),
      total: matching.length,
    };
  }

  async listEvents(requestId: string): Promise<MediaEventRecord[]> {
    return this.events.get(requestId) ?? [];
  }

  async applyUpdate(
    requestId: string,
    patch: MediaRequestPatch,
    events: NewMediaEvent[],
  ): Promise<void> {
    const record = this.requests.find((request) => request.id === requestId);
    if (!record) return;
    if (patch.status !== undefined) record.status = patch.status;
    if (patch.assignedTo !== undefined) {
      record.assignedTo = patch.assignedTo;
      record.assignedToEmail =
        this.users.find((user) => user.id === patch.assignedTo)?.email ?? null;
    }
    if (patch.closedAt !== undefined) record.closedAt = patch.closedAt;
    if (patch.reviewerGuidance !== undefined) record.reviewerGuidance = patch.reviewerGuidance;
    if (patch.aiDraft !== undefined) record.aiDraft = patch.aiDraft;
    if (patch.aiSources !== undefined) record.aiSources = patch.aiSources;
    if (patch.aiGap !== undefined) record.aiGap = patch.aiGap;
    if (patch.aiModel !== undefined) record.aiModel = patch.aiModel;
    if (patch.aiGeneratedAt !== undefined) record.aiGeneratedAt = patch.aiGeneratedAt;
    if (patch.approvedResponse !== undefined) record.approvedResponse = patch.approvedResponse;
    if (patch.approvedSources !== undefined) record.approvedSources = patch.approvedSources;
    if (patch.approvedAt !== undefined) record.approvedAt = patch.approvedAt;
    if (patch.approvedBy !== undefined) record.approvedBy = patch.approvedBy;
    if (patch.rejectedReason !== undefined) record.rejectedReason = patch.rejectedReason;
    record.updatedAt = new Date();
    for (const event of events) await this.insertEvent(requestId, event);
  }

  async findUserByEmail(email: string): Promise<UserIdentity | undefined> {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  async findUserById(id: string): Promise<UserIdentity | undefined> {
    return this.users.find((user) => user.id === id);
  }
}

class FakeDraftService {
  result: MediaDraftResult = {
    text: "Headline inflation was 3.2% in July 2026 [cpi-index#4].",
    sources: [
      {
        chunkId: 4,
        source: "ghs-2025-statistical-release.md",
        title: "CPI index",
        snippet: "July 2026 CPI",
      },
      { chunkId: 9, source: "ghs-2025-media-release.md", title: "Other", snippet: "not cited" },
    ],
    gap: null,
    model: "test/model",
  };

  calls = 0;
  lastGuidance: string | null = null;

  async generate(
    _claim?: string,
    _context?: string | null,
    guidance: string | null = null,
  ): Promise<MediaDraftResult> {
    this.calls += 1;
    this.lastGuidance = guidance;
    return this.result;
  }
}

class FakeGovernanceService {
  enabled = true;
  confidence = 0.85;

  async settings() {
    return {
      confidenceMin: this.confidence,
      generationEnabled: this.enabled,
      enabledTools: ["search_statssa"],
      policies: [],
      incidentResponse: [],
      updatedAt: null,
      updatedBy: null,
    };
  }

  async confidenceMin() {
    return this.confidence;
  }

  async isGenerationEnabled() {
    return this.enabled;
  }

  async enabledTools() {
    return ["search_statssa"];
  }
}

const staff: AuthUser = { id: "staff-1", role: "Staff" };
const press: AuthUser = { id: "press-1", role: "Press" };

const submission = {
  fullName: "Sipho Dlamini",
  claim: "Is it true that headline inflation fell to 2% in July 2026?",
};

function makeService() {
  const fake = new FakeRepository();
  fake.users.push(
    { id: "press-1", email: "sipho@example.co.za" },
    { id: "staff-1", email: "staff@statssa.gov.za" },
  );
  const drafts = new FakeDraftService();
  const governance = new FakeGovernanceService();
  const gaps = { record: vi.fn().mockResolvedValue(undefined) };
  const labelling = { labelPending: vi.fn().mockResolvedValue(0) };
  const service = new MediaService(
    fake as unknown as MediaRepository,
    drafts as unknown as MediaDraftService,
    governance as unknown as GovernanceService,
    gaps as unknown as GapsService,
    labelling as unknown as GapsLabellingService,
  );
  return { fake, drafts, governance, gaps, labelling, service };
}

async function waitForStatus(fake: FakeRepository, status: string) {
  await vi.waitFor(() => {
    expect(fake.requests[0]?.status).toBe(status);
  });
}

describe("MediaService", () => {
  let fake: FakeRepository;
  let drafts: FakeDraftService;
  let service: MediaService;

  beforeEach(() => {
    ({ fake, drafts, service } = makeService());
  });

  it("stores a submission against the signed-in account and drafts a response", async () => {
    const created = await service.submit(submission, press);

    expect(created.reference).toMatch(/^MEDIA-\d{4}-[A-Z0-9]{6}$/);
    expect(created.status).toBe("submitted");

    const [stored] = fake.requests;
    if (!stored) throw new Error("request not stored");
    expect(stored.requesterEmail).toBe("sipho@example.co.za");
    expect(stored.requesterId).toBe("press-1");

    await waitForStatus(fake, "awaiting_review");
    expect(stored.aiDraft).toContain("[cpi-index#4]");
    expect(stored.aiSources).toHaveLength(2);
    expect(stored.aiGap).toBeNull();

    const events = fake.events.get(stored.id) ?? [];
    expect(events.map((event) => event.kind)).toEqual([
      "submitted",
      "status_changed",
      "draft_generated",
      "status_changed",
    ]);
    expect(events[2]).toMatchObject({ visibility: "internal", actorLabel: "Rafiki" });
  });

  it("flags an information gap instead of generating unsupported wording", async () => {
    drafts.result = {
      text: null,
      sources: [],
      gap: "No approved Stats SA source covers this claim.",
      model: "test/model",
    };

    await service.submit(submission, press);
    await waitForStatus(fake, "information_gap");

    const [stored] = fake.requests;
    if (!stored) throw new Error("request not stored");
    expect(stored.aiDraft).toBeNull();
    expect(stored.aiGap).toContain("No approved Stats SA source");
  });

  it("logs an ungrounded media claim in the knowledge-gap log", async () => {
    const built = makeService();
    built.drafts.result = {
      text: null,
      sources: [],
      gap: "No approved Stats SA source covers this claim.",
      model: "test/model",
    };

    await built.service.submit(submission, press);
    await waitForStatus(built.fake, "information_gap");

    expect(built.gaps.record).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "media_draft",
        query: submission.claim,
        reference: expect.stringMatching(/^MEDIA-\d{4}-[A-Z0-9]{6}$/),
        reason: "No approved Stats SA source covers this claim.",
      }),
    );
    expect(built.labelling.labelPending).toHaveBeenCalled();
  });

  it("hides the AI draft from the requester and shows it to reviewers", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";

    const tracking = await service.trackForOwner(reference, press);
    expect(tracking).not.toHaveProperty("draft");
    expect(tracking).not.toHaveProperty("reviewerGuidance");
    expect(tracking.events.every((event) => event.visibility === "requester")).toBe(true);

    const detail = await service.detail(reference);
    expect(detail.draft?.text).toContain("3.2%");

    await expect(service.trackForOwner(reference, staff)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("approves a reviewed response and keeps only the cited sources", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";

    const approved = await service.approve(
      reference,
      { response: "Headline inflation was 3.2% in July 2026 [cpi-index#4]." },
      staff,
    );

    expect(approved.status).toBe("approved");
    expect(approved.approvedResponse).toContain("3.2%");
    expect(approved.approvedSources).toHaveLength(1);
    expect(approved.approvedSources[0]?.chunkId).toBe(4);
    expect(approved.approvedAt).not.toBeNull();

    const events = fake.events.get(fake.requests[0]?.id ?? "") ?? [];
    expect(events.at(-1)?.kind).toBe("approved");
  });

  it("refuses to approve a request that is not under review", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";
    await service.approve(reference, { response: "A response long enough to pass." }, staff);

    await expect(
      service.approve(reference, { response: "Another response long enough." }, staff),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("declines a request with a reason the requester can see", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";

    const rejected = await service.reject(reference, { reason: "Outside our mandate." }, staff);
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectedReason).toBe("Outside our mandate.");

    const tracking = await service.trackForOwner(reference, press);
    expect(tracking.events.some((event) => event.message === "Outside our mandate.")).toBe(true);
  });

  it("keeps approval and rejection out of the generic update path", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";

    await expect(service.update(reference, { status: "approved" }, staff)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.update(reference, { status: "rejected" }, staff)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("assigns by email and rejects an unknown assignee", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";

    const assigned = await service.update(reference, { assignedTo: "staff@statssa.gov.za" }, staff);
    expect(assigned.assignedTo).toBe("staff-1");
    expect(assigned.assignedToEmail).toBe("staff@statssa.gov.za");

    await expect(
      service.update(reference, { assignedTo: "nobody@statssa.gov.za" }, staff),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lets only the owner withdraw an open request", async () => {
    await service.submit(submission, press);
    const reference = fake.requests[0]?.reference ?? "";

    await expect(service.withdraw(reference, staff)).rejects.toBeInstanceOf(NotFoundException);

    const withdrawn = await service.withdraw(reference, press);
    expect(withdrawn.status).toBe("withdrawn");
  });

  it("regenerates a draft for reviewers while the request is open", async () => {
    drafts.result = {
      text: null,
      sources: [],
      gap: "No approved Stats SA source covers this claim.",
      model: "test/model",
    };
    await service.submit(submission, press);
    await waitForStatus(fake, "information_gap");
    const reference = fake.requests[0]?.reference ?? "";

    drafts.result = {
      text: "A fresh grounded draft [cpi-index#4].",
      sources: [
        {
          chunkId: 4,
          source: "ghs-2025-statistical-release.md",
          title: "CPI index",
          snippet: "July 2026 CPI",
        },
      ],
      gap: null,
      model: "test/model",
    } satisfies MediaDraftResult;

    await service.regenerate(reference, {}, staff);
    await waitForStatus(fake, "awaiting_review");
    expect(fake.requests[0]?.aiDraft).toContain("fresh grounded draft");
  });

  it("stores reviewer guidance and records it on the timeline", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";

    const updated = await service.update(
      reference,
      { guidance: "  Emphasise core inflation.  " },
      staff,
    );

    expect(updated.reviewerGuidance).toBe("Emphasise core inflation.");
    expect(fake.requests[0]?.reviewerGuidance).toBe("Emphasise core inflation.");

    const events = fake.events.get(fake.requests[0]?.id ?? "") ?? [];
    expect(events.at(-1)).toMatchObject({ kind: "note", visibility: "internal" });
  });

  it("clears reviewer guidance when an empty string is sent", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";
    await service.update(reference, { guidance: "Cover core inflation." }, staff);

    const cleared = await service.update(reference, { guidance: "" }, staff);
    expect(cleared.reviewerGuidance).toBeNull();
  });

  it("regenerates with the stored guidance and can update it in one call", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";
    await service.update(reference, { guidance: "Emphasise core inflation." }, staff);

    await service.regenerate(reference, {}, staff);
    await vi.waitFor(() => expect(drafts.lastGuidance).toBe("Emphasise core inflation."));
    await waitForStatus(fake, "awaiting_review");

    await service.regenerate(reference, { guidance: "Cover the monthly change too." }, staff);
    await vi.waitFor(() => expect(drafts.lastGuidance).toBe("Cover the monthly change too."));
    expect(fake.requests[0]?.reviewerGuidance).toBe("Cover the monthly change too.");
  });

  it("returns only the requester's own requests, as summaries with a total", async () => {
    await service.submit(submission, press);
    await service.submit(
      { ...submission, claim: "Did GDP grow in the second quarter of 2026?" },
      press,
    );
    await service.submit({ ...submission, claim: "A staff member's unrelated query." }, staff);

    const mine = await service.listMine(press, { limit: 25, offset: 0 });
    expect(mine.total).toBe(2);
    expect(mine.requests).toHaveLength(2);
    expect(mine.requests.every((request) => !("requesterName" in request))).toBe(true);
    expect(mine.requests[0]).toMatchObject({ hasResponse: false, status: expect.any(String) });
  });

  it("searches and paginates the requester's own requests", async () => {
    await service.submit({ ...submission, claim: "Is headline inflation 2% in July 2026?" }, press);
    await service.submit(
      { ...submission, claim: "Did GDP grow in the second quarter of 2026?" },
      press,
    );

    const hit = await service.listMine(press, { search: "GDP", limit: 25, offset: 0 });
    expect(hit.total).toBe(1);
    expect(hit.requests[0]?.claim).toContain("GDP");

    const page = await service.listMine(press, { limit: 1, offset: 1 });
    expect(page.requests).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it("feeds approved official responses without requester identity", async () => {
    await service.submit(submission, press);
    await waitForStatus(fake, "awaiting_review");
    const reference = fake.requests[0]?.reference ?? "";
    await service.approve(
      reference,
      { response: "Headline inflation was 3.2% in July 2026 [cpi-index#4]." },
      staff,
    );

    const feed = await service.listOfficialResponses({ limit: 25, offset: 0 });
    expect(feed.total).toBe(1);
    expect(feed.responses[0]).toEqual({
      reference,
      claim: submission.claim,
      response: "Headline inflation was 3.2% in July 2026 [cpi-index#4].",
      sources: [expect.objectContaining({ chunkId: 4 })],
      approvedAt: expect.any(String),
    });
    expect(feed.responses[0]).not.toHaveProperty("requesterName");
  });

  it("retries when a generated reference collides", async () => {
    fake.duplicateReferences.add("MEDIA-2026-COLLIDE");
    const spy = vi.spyOn(service as unknown as { reference(): string }, "reference");
    spy.mockReturnValueOnce("MEDIA-2026-COLLIDE").mockReturnValue("MEDIA-2026-UNIQUE");

    const created = await service.submit(submission, press);
    expect(created.reference).toBe("MEDIA-2026-UNIQUE");
    expect(fake.requests).toHaveLength(1);
  });

  it("requires an account that still exists", async () => {
    await expect(service.submit(submission, { id: "ghost", role: "Press" })).rejects.toThrow(
      "Sign in again",
    );
  });
});
