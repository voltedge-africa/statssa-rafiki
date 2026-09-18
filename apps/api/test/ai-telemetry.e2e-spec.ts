import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AuthUser } from "@voltedge/auth-contract";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { AiTelemetryService } from "../src/admin/ai-telemetry.service.ts";
import { AppModule } from "../src/app.module.ts";
import { AuthService } from "../src/auth/auth.service.ts";
import type { AuthenticatedRequest } from "../src/auth/auth.types.ts";

const users: Record<string, AuthUser> = {
  "press-token": { id: "press-1", role: "Press" },
  "staff-token": { id: "staff-1", role: "Staff" },
  "admin-token": { id: "admin-1", role: "Admin" },
};

const emptyTotals = {
  requests: 0,
  toolCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  avgDurationMs: 0,
  errorCount: 0,
};

describe("ai telemetry api", () => {
  let app: INestApplication;

  const telemetry = {
    usage: vi.fn(async () => ({
      totals: emptyTotals,
      byModel: [],
      byTool: [],
      byFeature: [],
      byRole: [],
      byDay: [],
    })),
    modelCalls: vi.fn(async () => ({ items: [], total: 0 })),
    toolCalls: vi.fn(async () => ({ items: [], total: 0 })),
    session: vi.fn(async () => []),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({
        verify: vi.fn(
          async (_request: AuthenticatedRequest, token: string) => users[token] ?? null,
        ),
      })
      .overrideProvider(AiTelemetryService)
      .useValue(telemetry)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.getHttpServer()).get("/admin/ai/usage");
    expect(response.status).toBe(401);
  });

  it("guards the governance endpoints by Admin role", async () => {
    const forbidden = await request(app.getHttpServer())
      .get("/admin/ai/usage")
      .set("Authorization", "Bearer staff-token");
    expect(forbidden.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .get("/admin/ai/usage?model=muse-spark&role=Staff")
      .set("Authorization", "Bearer admin-token");
    expect(allowed.status).toBe(200);
    expect(telemetry.usage).toHaveBeenCalledWith({ model: "muse-spark", role: "Staff" });
  });

  it("paginates and validates model call queries", async () => {
    await request(app.getHttpServer())
      .get("/admin/ai/model-calls?limit=10&offset=20&feature=chat")
      .set("Authorization", "Bearer admin-token")
      .expect(200);
    expect(telemetry.modelCalls).toHaveBeenCalledWith({ feature: "chat" }, 10, 20);

    const invalid = await request(app.getHttpServer())
      .get("/admin/ai/model-calls?from=not-a-date")
      .set("Authorization", "Bearer admin-token");
    expect(invalid.status).toBe(400);
  });

  it("returns the span tree for a session", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin/ai/sessions/chat-123")
      .set("Authorization", "Bearer admin-token");
    expect(response.status).toBe(200);
    expect(telemetry.session).toHaveBeenCalledWith("chat-123");
    expect(response.body).toEqual({ spans: [] });
  });

  it("restricts the live telemetry buffer to Admin", async () => {
    const forbidden = await request(app.getHttpServer())
      .get("/api/telemetry")
      .set("Authorization", "Bearer staff-token");
    expect(forbidden.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .get("/api/telemetry")
      .set("Authorization", "Bearer admin-token");
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ spans: [] });
  });
});
