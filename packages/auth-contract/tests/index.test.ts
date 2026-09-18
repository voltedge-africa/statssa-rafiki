import { expect, test } from "vite-plus/test";
import {
  appUrlFromOrigin,
  APP_PORTS,
  DEFAULT_ROLE,
  isRole,
  ROLES,
  SESSION_ACCESS_COOKIE,
  SESSION_REFRESH_COOKIE,
  subjects,
  workspaceForRole,
} from "../src/index.ts";

test("exposes the three Rafiki roles", () => {
  expect(ROLES).toEqual(["Press", "Staff", "Admin"]);
  expect(DEFAULT_ROLE).toBe("Press");
});

test("isRole narrows known roles only", () => {
  expect(isRole("Admin")).toBe(true);
  expect(isRole("admin")).toBe(false);
  expect(isRole(undefined)).toBe(false);
});

test("subject schema accepts a valid user", async () => {
  const result = await subjects.user["~standard"].validate({ id: "user-1", role: "Staff" });
  expect(result.issues).toBeUndefined();
  expect(result).toMatchObject({ value: { id: "user-1", role: "Staff" } });
});

test("subject schema rejects an unknown role", async () => {
  const result = await subjects.user["~standard"].validate({ id: "user-1", role: "Root" });
  expect(result.issues).toBeDefined();
});

test("routes each role to its workspace", () => {
  expect(workspaceForRole("Press")).toBe("mediaPortal");
  expect(workspaceForRole("Staff")).toBe("controlCentre");
  expect(workspaceForRole("Admin")).toBe("controlCentre");
});

test("resolves sibling app URLs from an origin", () => {
  expect(appUrlFromOrigin("http://localhost:3002", "mediaPortal")).toBe("http://localhost:3004");
  expect(appUrlFromOrigin("https://rafiki.ts.net:3002", "controlCentre")).toBe(
    "https://rafiki.ts.net:3006",
  );
});

test("shares one session cookie name across apps", () => {
  expect(SESSION_ACCESS_COOKIE).toBe("rafiki_access");
  expect(SESSION_REFRESH_COOKIE).toBe("rafiki_refresh");
  expect(APP_PORTS.auth).toBe(3000);
});
