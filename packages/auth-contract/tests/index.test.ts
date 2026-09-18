import { expect, test } from "vite-plus/test";
import { DEFAULT_ROLE, isRole, ROLES, subjects } from "../src/index.ts";

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
