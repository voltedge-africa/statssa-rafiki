import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AuthUser } from "@voltedge/auth-contract";
import type { AnalysisBrief } from "@voltedge/brief-contract";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { AnalysisService } from "../src/analysis/analysis.service.ts";
import { AppModule } from "../src/app.module.ts";
import { AuthService } from "../src/auth/auth.service.ts";
import type { AuthenticatedRequest } from "../src/auth/auth.types.ts";

const users: Record<string, AuthUser> = {
  "press-token": { id: "press-1", role: "Press" },
  "staff-token": { id: "staff-1", role: "Staff" },
  "admin-token": { id: "admin-1", role: "Admin" },
};

const brief: AnalysisBrief = {
  id: "brief-1",
  title: "Analysis: General Household Survey 2025",
  sources: ["ghs-2025-statistical-release.md"],
  focus: null,
  content: {
    summary: "Services improved [ghs-2025-statistical-release.md#4].",
    keyFindings: [
      { title: "Sanitation", detail: "Rose to 84.0% [ghs-2025-statistical-release.md#4]." },
    ],
    statistics: [{ label: "Sanitation", value: "84.0%", period: "2025" }],
    trends: [],
    insights: [],
    context: [],
  },
  references: [
    {
      chunkId: 4,
      table: null,
      source: "ghs-2025-statistical-release.md",
      title: "General Household Survey 2025",
      snippet: "84.0%",
    },
  ],
  verification: { status: "verified", unverified: [] },
  model: "test/model",
  createdByLabel: "staff@statssa.gov.za",
  createdAt: "2026-09-19T10:00:00.000Z",
};

describe("analysis api", () => {
  let app: INestApplication;

  const analysis = {
    documents: vi.fn(async () => ({
      documents: [
        {
          source: "ghs-2025-statistical-release.md",
          title: "General Household Survey 2025",
          characters: 293970,
          chunks: 393,
        },
      ],
    })),
    create: vi.fn(async () => brief),
    list: vi.fn(async () => ({
      briefs: [
        {
          id: brief.id,
          title: brief.title,
          sources: brief.sources,
          createdAt: brief.createdAt,
          createdByLabel: brief.createdByLabel,
          highlights: 2,
        },
      ],
      total: 1,
    })),
    get: vi.fn(async () => brief),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({
        verify: vi.fn(
          async (_request: AuthenticatedRequest, token: string) => users[token] ?? null,
        ),
      })
      .overrideProvider(AnalysisService)
      .useValue(analysis)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuses every analysis route for Press", async () => {
    const list = await request(app.getHttpServer())
      .get("/analysis/documents")
      .set("Authorization", "Bearer press-token");
    const create = await request(app.getHttpServer())
      .post("/analysis/briefs")
      .set("Authorization", "Bearer press-token")
      .send({ sources: ["ghs-2025-statistical-release.md"] });
    const briefs = await request(app.getHttpServer())
      .get("/analysis/briefs")
      .set("Authorization", "Bearer press-token");
    const detail = await request(app.getHttpServer())
      .get("/analysis/briefs/brief-1")
      .set("Authorization", "Bearer press-token");

    expect([list.status, create.status, briefs.status, detail.status]).toEqual([
      403, 403, 403, 403,
    ]);
  });

  it("lists indexed documents for Staff", async () => {
    const response = await request(app.getHttpServer())
      .get("/analysis/documents")
      .set("Authorization", "Bearer staff-token");

    expect(response.status).toBe(200);
    expect(response.body.documents[0]).toMatchObject({
      source: "ghs-2025-statistical-release.md",
      chunks: 393,
    });
  });

  it("validates a brief request and forwards the parsed scope", async () => {
    const invalid = await request(app.getHttpServer())
      .post("/analysis/briefs")
      .set("Authorization", "Bearer staff-token")
      .send({ sources: [] });

    expect(invalid.status).toBe(400);
    expect(invalid.body.issues.map((issue: { path: string }) => issue.path)).toContain("sources");

    const response = await request(app.getHttpServer())
      .post("/analysis/briefs")
      .set("Authorization", "Bearer staff-token")
      .send({
        sources: ["ghs-2025-statistical-release.md"],
        focus: "  media angles  ",
      });

    expect(response.status).toBe(201);
    expect(response.body.brief.id).toBe("brief-1");
    expect(analysis.create).toHaveBeenLastCalledWith(
      { sources: ["ghs-2025-statistical-release.md"], focus: "media angles" },
      users["staff-token"],
    );
  });

  it("lists and fetches saved briefs", async () => {
    const list = await request(app.getHttpServer())
      .get("/analysis/briefs?q=ghs&limit=10&offset=5")
      .set("Authorization", "Bearer admin-token");

    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(analysis.list).toHaveBeenLastCalledWith({ q: "ghs", limit: 10, offset: 5 });

    const detail = await request(app.getHttpServer())
      .get("/analysis/briefs/brief-1")
      .set("Authorization", "Bearer admin-token");

    expect(detail.status).toBe(200);
    expect(detail.body.brief.verification.status).toBe("verified");
  });

  it("rejects a non-numeric limit", async () => {
    const response = await request(app.getHttpServer())
      .get("/analysis/briefs?limit=ten")
      .set("Authorization", "Bearer staff-token");
    expect(response.status).toBe(400);
  });
});
