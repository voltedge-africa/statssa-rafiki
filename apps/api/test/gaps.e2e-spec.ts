import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AuthUser } from "@voltedge/auth-contract";
import type { GapSummary } from "@voltedge/gaps-contract";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { AppModule } from "../src/app.module.ts";
import { AuthService } from "../src/auth/auth.service.ts";
import type { AuthenticatedRequest } from "../src/auth/auth.types.ts";
import { GapsService } from "../src/gaps/gaps.service.ts";

const users: Record<string, AuthUser> = {
  "press-token": { id: "press-1", role: "Press" },
  "staff-token": { id: "staff-1", role: "Staff" },
  "admin-token": { id: "admin-1", role: "Admin" },
};

const summary: GapSummary = {
  generatedAt: "2026-09-19T13:45:00.000Z",
  days: 30,
  from: "2026-08-21T00:00:00.000Z",
  to: "2026-09-20T00:00:00.000Z",
  total: 50,
  categories: 3,
  newCategories: 1,
  daily: [{ date: "2026-09-19", count: 2 }],
  surfaces: [
    { surface: "chat", count: 45 },
    { surface: "media_draft", count: 5 },
  ],
  topCategories: [
    {
      id: "cat-1",
      label: "GBV death statistics",
      queryCount: 50,
      share: 1,
      lastSeen: "2026-09-19T12:00:00.000Z",
    },
  ],
  topOutlets: [{ outlet: "Daily Maverick", count: 3 }],
};

describe("gaps api", () => {
  let app: INestApplication;

  const gaps = {
    summary: vi.fn(async () => summary),
    listCategories: vi.fn(async () => ({
      categories: [
        {
          id: "cat-1",
          label: "GBV death statistics",
          description: null,
          queryCount: 50,
          firstSeen: "2026-09-01T00:00:00.000Z",
          lastSeen: "2026-09-19T12:00:00.000Z",
          surfaces: ["chat", "media_draft"],
        },
      ],
      total: 1,
    })),
    listQueries: vi.fn(async () => ({
      queries: [
        {
          id: "gap-1",
          categoryId: "cat-1",
          surface: "chat",
          query: "gbv death toll 2026",
          reference: null,
          outlet: null,
          role: "anonymous",
          origin: "localhost:3003",
          reason: "not covered",
          createdAt: "2026-09-19T12:00:00.000Z",
        },
      ],
      total: 1,
    })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({
        verify: vi.fn(
          async (_request: AuthenticatedRequest, token: string) => users[token] ?? null,
        ),
      })
      .overrideProvider(GapsService)
      .useValue(gaps)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuses the gap log for Press", async () => {
    const response = await request(app.getHttpServer())
      .get("/gaps/summary")
      .set("Authorization", "Bearer press-token");
    expect(response.status).toBe(403);
  });

  it("serves the summary with bounded days", async () => {
    const response = await request(app.getHttpServer())
      .get("/gaps/summary?days=90")
      .set("Authorization", "Bearer staff-token");

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(50);
    expect(response.body.surfaces).toHaveLength(2);

    await request(app.getHttpServer())
      .get("/gaps/summary?days=9999")
      .set("Authorization", "Bearer staff-token");
    expect(gaps.summary).toHaveBeenLastCalledWith(365);
  });

  it("lists categories with search and pagination", async () => {
    const response = await request(app.getHttpServer())
      .get("/gaps/categories?q=gbv&limit=10&offset=5")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body.categories[0]).toMatchObject({ label: "GBV death statistics" });
    expect(gaps.listCategories).toHaveBeenLastCalledWith({ q: "gbv", limit: 10, offset: 5 });
  });

  it("drills into a category's queries", async () => {
    const response = await request(app.getHttpServer())
      .get("/gaps/categories/cat-1/queries")
      .set("Authorization", "Bearer staff-token");

    expect(response.status).toBe(200);
    expect(response.body.queries[0]).toMatchObject({ surface: "chat", role: "anonymous" });
    expect(gaps.listQueries).toHaveBeenLastCalledWith("cat-1", 25, 0);
  });
});
