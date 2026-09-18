import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AuthUser } from "@voltedge/auth-contract";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { AppModule } from "../src/app.module.ts";
import { AuthService } from "../src/auth/auth.service.ts";
import type { AuthenticatedRequest } from "../src/auth/auth.types.ts";
import { PopiaService } from "../src/popia/popia.service.ts";

const users: Record<string, AuthUser> = {
  "press-token": { id: "press-1", role: "Press" },
  "staff-token": { id: "staff-1", role: "Staff" },
  "admin-token": { id: "admin-1", role: "Admin" },
};

const submitted = {
  reference: "POPIA-2026-ABC123",
  type: "access",
  status: "submitted",
  requesterName: "Thandi Mokoena",
  details: "Please send me a copy of the personal information you hold about me.",
  desiredOutcome: null,
  resolution: null,
  dueAt: "2026-10-18T00:00:00.000Z",
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
  closedAt: null,
};

const staffDetail = {
  ...submitted,
  id: "request-1",
  requesterEmail: "thandi@example.co.za",
  requesterPhone: null,
  requesterId: null,
  assignedTo: null,
  assignedToEmail: null,
  events: [],
};

const validBody = {
  type: "access",
  fullName: "Thandi Mokoena",
  email: "thandi@example.co.za",
  details: "Please send me a copy of the personal information you hold about me.",
};

describe("popia api", () => {
  let app: INestApplication;

  const popia = {
    submit: vi.fn(async (input: { type: string }, user?: AuthUser) => ({
      ...submitted,
      type: input.type,
      ...(user ? { requesterId: user.id } : {}),
    })),
    track: vi.fn(async () => ({ ...submitted, events: [] })),
    listMine: vi.fn(async () => []),
    listForStaff: vi.fn(async () => ({ requests: [], total: 0 })),
    detail: vi.fn(async () => staffDetail),
    update: vi.fn(async () => staffDetail),
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
      .overrideProvider(PopiaService)
      .useValue(popia)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts an anonymous submission", async () => {
    const response = await request(app.getHttpServer()).post("/popia/requests").send(validBody);
    expect(response.status).toBe(201);
    expect(response.body.request).toMatchObject({ reference: "POPIA-2026-ABC123" });
    expect(popia.submit).toHaveBeenCalledWith(expect.objectContaining(validBody), undefined);
  });

  it("links a submission from a signed-in caller", async () => {
    const response = await request(app.getHttpServer())
      .post("/popia/requests")
      .set("Authorization", "Bearer press-token")
      .send(validBody);

    expect(response.status).toBe(201);
    expect(popia.submit).toHaveBeenLastCalledWith(expect.anything(), users["press-token"]);
  });

  it("rejects an invalid submission with field details", async () => {
    const response = await request(app.getHttpServer())
      .post("/popia/requests")
      .send({ ...validBody, email: "not-an-email", details: "short" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.issues.map((issue: { path: string }) => issue.path)).toContain("email");
  });

  it("rejects a bad token even where authentication is optional", async () => {
    const response = await request(app.getHttpServer())
      .post("/popia/requests")
      .set("Authorization", "Bearer nope")
      .send(validBody);

    expect(response.status).toBe(401);
  });

  it("tracks a request without a token", async () => {
    const response = await request(app.getHttpServer())
      .post("/popia/requests/track")
      .send({ reference: "popia-2026-abc123", email: "thandi@example.co.za" });

    expect(response.status).toBe(200);
    expect(popia.track).toHaveBeenCalledWith({
      reference: "POPIA-2026-ABC123",
      email: "thandi@example.co.za",
    });
  });

  it("requires a token for a requester's own requests", async () => {
    const anonymous = await request(app.getHttpServer()).get("/popia/requests/mine");
    expect(anonymous.status).toBe(401);

    const signedIn = await request(app.getHttpServer())
      .get("/popia/requests/mine")
      .set("Authorization", "Bearer press-token");
    expect(signedIn.status).toBe(200);
    expect(popia.listMine).toHaveBeenCalledWith(users["press-token"]);
  });

  it("guards the case queue by role", async () => {
    const forbidden = await request(app.getHttpServer())
      .get("/popia/requests")
      .set("Authorization", "Bearer press-token");
    expect(forbidden.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .get("/popia/requests?status=submitted&assigned=me&limit=10")
      .set("Authorization", "Bearer staff-token");
    expect(allowed.status).toBe(200);
    expect(popia.listForStaff).toHaveBeenCalledWith(
      {
        status: "submitted",
        type: undefined,
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
      .get("/popia/requests?status=banana")
      .set("Authorization", "Bearer staff-token");
    expect(response.status).toBe(400);
  });

  it("updates a request as an admin", async () => {
    const response = await request(app.getHttpServer())
      .patch("/popia/requests/popia-2026-abc123")
      .set("Authorization", "Bearer admin-token")
      .send({ status: "in_review", assignedTo: "me" });

    expect(response.status).toBe(200);
    expect(popia.update).toHaveBeenCalledWith(
      "POPIA-2026-ABC123",
      { status: "in_review", assignedTo: "me" },
      users["admin-token"],
    );
  });

  it("validates the update body", async () => {
    const response = await request(app.getHttpServer())
      .patch("/popia/requests/POPIA-2026-ABC123")
      .set("Authorization", "Bearer staff-token")
      .send({ status: "banana" });
    expect(response.status).toBe(400);
  });

  it("adds a case note", async () => {
    const response = await request(app.getHttpServer())
      .post("/popia/requests/POPIA-2026-ABC123/notes")
      .set("Authorization", "Bearer staff-token")
      .send({ message: "Check the survey register.", visibility: "requester" });

    expect(response.status).toBe(201);
    expect(popia.addNote).toHaveBeenCalledWith(
      "POPIA-2026-ABC123",
      { message: "Check the survey register.", visibility: "requester" },
      users["staff-token"],
    );
  });
});
