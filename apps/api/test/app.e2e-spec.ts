import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AuthUser } from "@voltedge/auth-contract";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { AppModule } from "../src/app.module.ts";
import { AuthService } from "../src/auth/auth.service.ts";
import type { AuthenticatedRequest } from "../src/auth/auth.types.ts";

const users: Record<string, AuthUser> = {
  "staff-token": { id: "staff-1", role: "Staff" },
  "admin-token": { id: "admin-1", role: "Admin" },
};

describe("api", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({
        verify: vi.fn(
          async (_request: AuthenticatedRequest, token: string) => users[token] ?? null,
        ),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves health without a token", async () => {
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok" });
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app.getHttpServer()).get("/me");
    expect(response.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const response = await request(app.getHttpServer())
      .get("/me")
      .set("Authorization", "Bearer nope");
    expect(response.status).toBe(401);
  });

  it("returns the verified subject", async () => {
    const response = await request(app.getHttpServer())
      .get("/me")
      .set("Authorization", "Bearer staff-token");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: "staff-1", role: "Staff" });
  });

  it("forbids a role that is not allowed", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin/ping")
      .set("Authorization", "Bearer staff-token");
    expect(response.status).toBe(403);
  });

  it("allows the required role", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin/ping")
      .set("Authorization", "Bearer admin-token");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Admin access confirmed" });
  });
});
