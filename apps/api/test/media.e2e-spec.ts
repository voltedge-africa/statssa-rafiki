import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AuthUser } from "@voltedge/auth-contract";
import type {
  MediaOfficialResponseListResponse,
  MediaRequestSummaryListResponse,
} from "@voltedge/media-contract";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { AppModule } from "../src/app.module.ts";
import { AuthService } from "../src/auth/auth.service.ts";
import type { AuthenticatedRequest } from "../src/auth/auth.types.ts";
import { MediaService } from "../src/media/media.service.ts";

const users: Record<string, AuthUser> = {
  "press-token": { id: "press-1", role: "Press" },
  "staff-token": { id: "staff-1", role: "Staff" },
  "admin-token": { id: "admin-1", role: "Admin" },
};

const submitted = {
  reference: "MEDIA-2026-ABC123",
  status: "submitted",
  requesterName: "Sipho Dlamini",
  claim: "Is it true that headline inflation fell to 2% in July 2026?",
  context: null,
  outlet: "The Daily Line",
  approvedResponse: null,
  approvedSources: [],
  approvedAt: null,
  rejectedReason: null,
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
  closedAt: null,
};

const staffDetail = {
  ...submitted,
  id: "request-1",
  requesterEmail: "sipho@example.co.za",
  requesterId: "press-1",
  assignedTo: null,
  assignedToEmail: null,
  draft: {
    text: "Headline inflation was 3.2% in July 2026 [cpi-index#4].",
    sources: [
      {
        chunkId: 4,
        source: "sample/cpi-index.md",
        title: "CPI index",
        snippet: "July 2026 CPI",
      },
    ],
    gap: null,
    model: "test/model",
    generatedAt: "2026-09-18T00:05:00.000Z",
    confidence: null,
  },
  events: [],
};

const validBody = {
  fullName: "Sipho Dlamini",
  claim: "Is it true that headline inflation fell to 2% in July 2026?",
  outlet: "The Daily Line",
};

describe("media api", () => {
  let app: INestApplication;

  const media = {
    submit: vi.fn(async () => submitted),
    listMine: vi.fn(async (): Promise<MediaRequestSummaryListResponse> => ({
      requests: [],
      total: 0,
    })),
    listOfficialResponses: vi.fn(async (): Promise<MediaOfficialResponseListResponse> => ({
      responses: [],
      total: 0,
    })),
    trackForOwner: vi.fn(async () => ({ ...submitted, events: [] })),
    withdraw: vi.fn(async () => ({ ...submitted, status: "withdrawn" })),
    listForStaff: vi.fn(async () => ({ requests: [], total: 0 })),
    detail: vi.fn(async () => staffDetail),
    update: vi.fn(async () => staffDetail),
    approve: vi.fn(async () => ({ ...staffDetail, status: "approved" })),
    reject: vi.fn(async () => ({ ...staffDetail, status: "rejected" })),
    regenerate: vi.fn(async () => staffDetail),
    addNote: vi.fn(async () => staffDetail),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({
        verify: vi.fn(
          async (_request: AuthenticatedRequest, token: string) => users[token] ?? null,
        ),
      })
      .overrideProvider(MediaService)
      .useValue(media)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires a token to submit a request", async () => {
    const response = await request(app.getHttpServer()).post("/media/requests").send(validBody);
    expect(response.status).toBe(401);
  });

  it("accepts a signed-in submission", async () => {
    const response = await request(app.getHttpServer())
      .post("/media/requests")
      .set("Authorization", "Bearer press-token")
      .send(validBody);

    expect(response.status).toBe(201);
    expect(response.body.request).toMatchObject({ reference: "MEDIA-2026-ABC123" });
    expect(media.submit).toHaveBeenLastCalledWith(
      expect.objectContaining(validBody),
      users["press-token"],
    );
  });

  it("rejects an invalid submission with field details", async () => {
    const response = await request(app.getHttpServer())
      .post("/media/requests")
      .set("Authorization", "Bearer press-token")
      .send({ ...validBody, claim: "short" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.issues.map((issue: { path: string }) => issue.path)).toContain("claim");
  });

  it("lists and tracks a requester's own requests", async () => {
    const mine = await request(app.getHttpServer())
      .get("/media/requests/mine")
      .set("Authorization", "Bearer press-token");
    expect(mine.status).toBe(200);
    expect(media.listMine).toHaveBeenCalledWith(users["press-token"], {
      search: undefined,
      status: undefined,
      limit: 50,
      offset: 0,
    });

    const tracked = await request(app.getHttpServer())
      .get("/media/requests/mine/media-2026-abc123")
      .set("Authorization", "Bearer press-token");
    expect(tracked.status).toBe(200);
    expect(media.trackForOwner).toHaveBeenCalledWith("MEDIA-2026-ABC123", users["press-token"]);
  });

  it("searches and paginates the requester's own list", async () => {
    const response = await request(app.getHttpServer())
      .get("/media/requests/mine?q=inflation&status=approved&limit=10&offset=5")
      .set("Authorization", "Bearer press-token");

    expect(response.status).toBe(200);
    expect(media.listMine).toHaveBeenCalledWith(users["press-token"], {
      search: "inflation",
      status: "approved",
      limit: 10,
      offset: 5,
    });
  });

  it("rejects an unknown status on the owner list", async () => {
    const response = await request(app.getHttpServer())
      .get("/media/requests/mine?status=banana")
      .set("Authorization", "Bearer press-token");
    expect(response.status).toBe(400);
  });

  it("serves the official responses feed to any signed-in user", async () => {
    media.listOfficialResponses.mockResolvedValueOnce({
      responses: [
        {
          reference: "MEDIA-2026-ABC123",
          claim: "Is it true that headline inflation fell to 2%?",
          response: "Headline inflation was 3.2% in July 2026 [cpi-index#4].",
          sources: [],
          approvedAt: "2026-09-18T00:00:00.000Z",
        },
      ],
      total: 1,
    });

    const response = await request(app.getHttpServer())
      .get("/media/requests/feed?limit=5")
      .set("Authorization", "Bearer press-token");
    expect(response.status).toBe(200);
    expect(response.body.responses).toHaveLength(1);
    expect(media.listOfficialResponses).toHaveBeenCalledWith({ limit: 5, offset: 0 });

    const anonymous = await request(app.getHttpServer()).get("/media/requests/feed");
    expect(anonymous.status).toBe(401);
  });

  it("lets the owner withdraw an open request", async () => {
    const response = await request(app.getHttpServer())
      .post("/media/requests/MEDIA-2026-ABC123/withdraw")
      .set("Authorization", "Bearer press-token");
    expect(response.status).toBe(200);
    expect(media.withdraw).toHaveBeenCalledWith("MEDIA-2026-ABC123", users["press-token"]);
  });

  it("guards the review queue by role", async () => {
    const forbidden = await request(app.getHttpServer())
      .get("/media/requests")
      .set("Authorization", "Bearer press-token");
    expect(forbidden.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .get("/media/requests?status=awaiting_review&assigned=me&limit=10")
      .set("Authorization", "Bearer staff-token");
    expect(allowed.status).toBe(200);
    expect(media.listForStaff).toHaveBeenCalledWith(
      {
        status: "awaiting_review",
        assigned: "me",
        search: undefined,
        limit: 10,
        offset: 0,
      },
      users["staff-token"],
    );
  });

  it("rejects an unknown queue status", async () => {
    const response = await request(app.getHttpServer())
      .get("/media/requests?status=banana")
      .set("Authorization", "Bearer staff-token");
    expect(response.status).toBe(400);
  });

  it("returns the staff case file with the AI draft", async () => {
    const response = await request(app.getHttpServer())
      .get("/media/requests/media-2026-abc123")
      .set("Authorization", "Bearer staff-token");
    expect(response.status).toBe(200);
    expect(media.detail).toHaveBeenCalledWith("MEDIA-2026-ABC123");
  });

  it("updates status and assignment for reviewers", async () => {
    const response = await request(app.getHttpServer())
      .patch("/media/requests/MEDIA-2026-ABC123")
      .set("Authorization", "Bearer admin-token")
      .send({ status: "information_gap", assignedTo: "me" });

    expect(response.status).toBe(200);
    expect(media.update).toHaveBeenCalledWith(
      "MEDIA-2026-ABC123",
      { status: "information_gap", assignedTo: "me" },
      users["admin-token"],
    );

    const guidance = await request(app.getHttpServer())
      .patch("/media/requests/MEDIA-2026-ABC123")
      .set("Authorization", "Bearer staff-token")
      .send({ guidance: "Cover core inflation too." });
    expect(guidance.status).toBe(200);
    expect(media.update).toHaveBeenLastCalledWith(
      "MEDIA-2026-ABC123",
      { guidance: "Cover core inflation too." },
      users["staff-token"],
    );

    const invalid = await request(app.getHttpServer())
      .patch("/media/requests/MEDIA-2026-ABC123")
      .set("Authorization", "Bearer staff-token")
      .send({ status: "banana" });
    expect(invalid.status).toBe(400);
  });

  it("approves a response and validates its length", async () => {
    const short = await request(app.getHttpServer())
      .post("/media/requests/MEDIA-2026-ABC123/approve")
      .set("Authorization", "Bearer staff-token")
      .send({ response: "short" });
    expect(short.status).toBe(400);

    const response = await request(app.getHttpServer())
      .post("/media/requests/MEDIA-2026-ABC123/approve")
      .set("Authorization", "Bearer staff-token")
      .send({ response: "Headline inflation was 3.2% in July 2026 [cpi-index#4]." });
    expect(response.status).toBe(201);
    expect(media.approve).toHaveBeenCalledWith(
      "MEDIA-2026-ABC123",
      { response: "Headline inflation was 3.2% in July 2026 [cpi-index#4]." },
      users["staff-token"],
    );
  });

  it("declines a request and requires a reason", async () => {
    const short = await request(app.getHttpServer())
      .post("/media/requests/MEDIA-2026-ABC123/reject")
      .set("Authorization", "Bearer staff-token")
      .send({ reason: "no" });
    expect(short.status).toBe(400);

    const response = await request(app.getHttpServer())
      .post("/media/requests/MEDIA-2026-ABC123/reject")
      .set("Authorization", "Bearer staff-token")
      .send({ reason: "Outside our mandate." });
    expect(response.status).toBe(201);
    expect(media.reject).toHaveBeenCalledWith(
      "MEDIA-2026-ABC123",
      { reason: "Outside our mandate." },
      users["staff-token"],
    );
  });

  it("regenerates a draft with reviewer guidance and adds case notes", async () => {
    const regenerated = await request(app.getHttpServer())
      .post("/media/requests/MEDIA-2026-ABC123/regenerate")
      .set("Authorization", "Bearer staff-token")
      .send({ guidance: "  Emphasise core inflation.  " });
    expect(regenerated.status).toBe(201);
    expect(media.regenerate).toHaveBeenCalledWith(
      "MEDIA-2026-ABC123",
      { guidance: "Emphasise core inflation." },
      users["staff-token"],
    );

    const plain = await request(app.getHttpServer())
      .post("/media/requests/MEDIA-2026-ABC123/regenerate")
      .set("Authorization", "Bearer staff-token")
      .send({});
    expect(plain.status).toBe(201);
    expect(media.regenerate).toHaveBeenLastCalledWith(
      "MEDIA-2026-ABC123",
      {},
      users["staff-token"],
    );

    const tooLong = await request(app.getHttpServer())
      .post("/media/requests/MEDIA-2026-ABC123/regenerate")
      .set("Authorization", "Bearer staff-token")
      .send({ guidance: "x".repeat(2001) });
    expect(tooLong.status).toBe(400);

    const note = await request(app.getHttpServer())
      .post("/media/requests/MEDIA-2026-ABC123/notes")
      .set("Authorization", "Bearer staff-token")
      .send({ message: "Checked with the CPI team.", visibility: "requester" });
    expect(note.status).toBe(201);
    expect(media.addNote).toHaveBeenCalledWith(
      "MEDIA-2026-ABC123",
      { message: "Checked with the CPI team.", visibility: "requester" },
      users["staff-token"],
    );
  });
});
