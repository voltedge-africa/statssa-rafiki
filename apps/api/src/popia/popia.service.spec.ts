import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PopiaService } from "./popia.service.ts";
import type {
  NewPopiaEvent,
  NewPopiaRequest,
  PopiaEventRecord,
  PopiaRequestPatch,
  PopiaRequestRecord,
  PopiaRepository,
  StaffRequestFilters,
  StaffRequestPage,
  UserIdentity,
} from "./popia.repository.ts";

class FakeRepository {
  requests: PopiaRequestRecord[] = [];
  events = new Map<string, PopiaEventRecord[]>();
  users: UserIdentity[] = [];
  duplicateReferences = new Set<string>();
  #seq = 1;

  async insertRequestWithEvent(
    request: NewPopiaRequest,
    event: NewPopiaEvent,
  ): Promise<PopiaRequestRecord> {
    if (this.duplicateReferences.has(request.reference)) {
      throw Object.assign(new Error("duplicate key"), { code: "23505" });
    }
    const now = new Date();
    const record: PopiaRequestRecord = {
      ...request,
      status: "submitted",
      resolution: null,
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

  async insertEvent(requestId: string, event: NewPopiaEvent): Promise<PopiaEventRecord> {
    const record: PopiaEventRecord = {
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

  async findByReference(reference: string): Promise<PopiaRequestRecord | undefined> {
    return this.requests.find((request) => request.reference === reference);
  }

  async findForRequester(
    reference: string,
    email: string,
  ): Promise<PopiaRequestRecord | undefined> {
    return this.requests.find(
      (request) =>
        request.reference === reference &&
        request.requesterEmail.toLowerCase() === email.toLowerCase(),
    );
  }

  async listByRequesterId(userId: string): Promise<PopiaRequestRecord[]> {
    return this.requests.filter((request) => request.requesterId === userId);
  }

  async listForStaff(filters: StaffRequestFilters): Promise<StaffRequestPage> {
    const matching = this.requests.filter((request) => {
      if (filters.status && request.status !== filters.status) return false;
      if (filters.type && request.type !== filters.type) return false;
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

  async listEvents(requestId: string): Promise<PopiaEventRecord[]> {
    return this.events.get(requestId) ?? [];
  }

  async applyUpdate(
    requestId: string,
    patch: PopiaRequestPatch,
    events: NewPopiaEvent[],
  ): Promise<void> {
    const record = this.requests.find((request) => request.id === requestId);
    if (!record) return;
    if (patch.status !== undefined) record.status = patch.status;
    if (patch.resolution !== undefined) record.resolution = patch.resolution;
    if (patch.assignedTo !== undefined) {
      record.assignedTo = patch.assignedTo;
      record.assignedToEmail =
        this.users.find((user) => user.id === patch.assignedTo)?.email ?? null;
    }
    if (patch.closedAt !== undefined) record.closedAt = patch.closedAt;
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

const staff: AuthUser = { id: "staff-1", role: "Staff" };
const requester: AuthUser = { id: "press-1", role: "Press" };

const submission = {
  type: "access" as const,
  fullName: "Thandi Mokoena",
  email: "thandi@example.co.za",
  details: "Please send me a copy of the personal information you hold about me.",
};

function makeService() {
  const fake = new FakeRepository();
  fake.users.push({ id: "staff-1", email: "staff@statssa.gov.za" });
  const service = new PopiaService(fake as unknown as PopiaRepository);
  return { fake, service };
}

describe("PopiaService", () => {
  let fake: FakeRepository;
  let service: PopiaService;

  beforeEach(() => {
    ({ fake, service } = makeService());
  });

  it("records a submission with a reference, a 30-day deadline and an audit event", async () => {
    const before = Date.now();
    const request = await service.submit(submission);

    expect(request.reference).toMatch(/^POPIA-\d{4}-[A-Z0-9]{6}$/);
    expect(request.status).toBe("submitted");
    expect(request.requesterName).toBe("Thandi Mokoena");

    const [stored] = fake.requests;
    if (!stored) throw new Error("request not stored");
    const window = stored.dueAt.getTime() - before;
    expect(window).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
    expect(window).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 5000);

    const events = fake.events.get(stored.id) ?? [];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "submitted", visibility: "requester" });
  });

  it("links a signed-in submission to the account", async () => {
    await service.submit(submission, requester);
    expect(fake.requests[0]?.requesterId).toBe("press-1");
  });

  it("retries when a generated reference collides", async () => {
    const reference = "POPIA-2026-COLLIDE";
    fake.duplicateReferences.add(reference);
    const service = new PopiaService(fake as unknown as PopiaRepository);
    const spy = vi.spyOn(service as unknown as { reference(): string }, "reference");
    spy.mockReturnValueOnce(reference).mockReturnValue("POPIA-2026-UNIQUE");

    const request = await service.submit(submission);
    expect(request.reference).toBe("POPIA-2026-UNIQUE");
    expect(fake.requests).toHaveLength(1);
  });

  it("tracks by reference and email, hiding internal notes", async () => {
    const created = await service.submit(submission);
    const record = fake.requests[0];
    if (!record) throw new Error("request not stored");
    await fake.insertEvent(record.id, {
      kind: "note",
      visibility: "internal",
      actorLabel: "staff@statssa.gov.za",
      message: "Internal only",
    });

    const tracked = await service.track({ reference: created.reference, email: submission.email });
    expect(tracked.events).toHaveLength(1);
    expect(tracked.events[0]?.kind).toBe("submitted");

    await expect(
      service.track({ reference: created.reference, email: "someone@else.co.za" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects transitions that skip the lifecycle", async () => {
    const created = await service.submit(submission);
    const record = fake.requests[0];
    if (!record) throw new Error("request not stored");
    record.status = "completed";

    await expect(
      service.update(created.reference, { status: "in_review" }, staff),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires a resolution before completing a request", async () => {
    const created = await service.submit(submission);
    await expect(
      service.update(created.reference, { status: "completed" }, staff),
    ).rejects.toBeInstanceOf(BadRequestException);

    const updated = await service.update(
      created.reference,
      { status: "completed", resolution: "Copy of the record sent to the requester." },
      staff,
    );
    expect(updated.status).toBe("completed");
    expect(updated.closedAt).not.toBeNull();
    expect(updated.events.map((event) => event.kind)).toEqual([
      "submitted",
      "resolution",
      "status_changed",
    ]);
  });

  it("assigns a request to the signed-in case worker", async () => {
    const created = await service.submit(submission);
    const updated = await service.update(created.reference, { assignedTo: "me" }, staff);

    expect(updated.assignedTo).toBe("staff-1");
    expect(updated.assignedToEmail).toBe("staff@statssa.gov.za");
    const assignment = updated.events.find((event) => event.kind === "assigned");
    expect(assignment).toMatchObject({ visibility: "internal" });
  });

  it("rejects an assignee that does not exist", async () => {
    const created = await service.submit(submission);
    await expect(
      service.update(created.reference, { assignedTo: "nobody@statssa.gov.za" }, staff),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("records requester-visible notes as case-worker messages", async () => {
    const created = await service.submit(submission);
    const updated = await service.addNote(
      created.reference,
      { message: "We need a certified copy of your ID.", visibility: "requester" },
      staff,
    );

    const note = updated.events.at(-1);
    expect(note).toMatchObject({
      kind: "note",
      visibility: "requester",
      actorLabel: "staff@statssa.gov.za",
    });

    const tracked = await service.track({ reference: created.reference, email: submission.email });
    expect(tracked.events.at(-1)).toMatchObject({ actorLabel: "Stats SA" });
  });

  it("maps the 'me' queue filter to the caller", async () => {
    const created = await service.submit(submission);
    await service.update(created.reference, { assignedTo: "me" }, staff);

    const myQueue = await service.listForStaff({ assigned: "me", limit: 25, offset: 0 }, staff);
    expect(myQueue.total).toBe(1);

    const unassigned = await service.listForStaff(
      { assigned: "unassigned", limit: 25, offset: 0 },
      staff,
    );
    expect(unassigned.total).toBe(0);
  });
});
