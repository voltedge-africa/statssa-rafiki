import { expect, test } from "vite-plus/test";
import { safeParse } from "valibot";
import {
  canTransition,
  createPopiaNoteSchema,
  isOpenStatus,
  isPopiaReference,
  isTerminalStatus,
  POPIA_REQUEST_TYPES,
  submitPopiaRequestSchema,
  trackPopiaRequestSchema,
  updatePopiaRequestSchema,
} from "../src/index.ts";

test("exposes the four POPIA rights", () => {
  expect(POPIA_REQUEST_TYPES).toEqual(["access", "correction", "deletion", "objection"]);
});

test("submission normalises the email and trims fields", () => {
  const result = safeParse(submitPopiaRequestSchema, {
    type: "access",
    fullName: "  Thandi Mokoena ",
    email: "  Thandi@Example.CO.ZA ",
    details: "  Please send me a copy of my census record. ",
  });
  expect(result.success).toBe(true);
  expect(result.output).toMatchObject({
    fullName: "Thandi Mokoena",
    email: "thandi@example.co.za",
    details: "Please send me a copy of my census record.",
  });
});

test("submission rejects a short description and unknown right", () => {
  expect(
    safeParse(submitPopiaRequestSchema, {
      type: "access",
      fullName: "Thandi Mokoena",
      email: "thandi@example.co.za",
      details: "too short",
    }).success,
  ).toBe(false);
  expect(
    safeParse(submitPopiaRequestSchema, {
      type: "erasure",
      fullName: "Thandi Mokoena",
      email: "thandi@example.co.za",
      details: "Please delete everything you hold about me.",
    }).success,
  ).toBe(false);
});

test("tracking normalises the reference and enforces its shape", () => {
  const valid = safeParse(trackPopiaRequestSchema, {
    reference: " popia-2026-ab12cd ",
    email: "thandi@example.co.za",
  });
  expect(valid.success).toBe(true);
  if (!valid.success) throw new Error("expected a valid tracking payload");
  expect(valid.output.reference).toBe("POPIA-2026-AB12CD");

  expect(
    safeParse(trackPopiaRequestSchema, { reference: "12345", email: "thandi@example.co.za" })
      .success,
  ).toBe(false);
});

test("updates allow clearing the assignee and resolution", () => {
  const result = safeParse(updatePopiaRequestSchema, {
    status: "completed",
    assignedTo: null,
    resolution: "  Personal information file sent to the requester.  ",
  });
  expect(result.success).toBe(true);
  expect(result.output).toMatchObject({
    status: "completed",
    assignedTo: null,
    resolution: "Personal information file sent to the requester.",
  });
});

test("notes default to internal visibility", () => {
  const result = safeParse(createPopiaNoteSchema, { message: "Check the survey register." });
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("expected a valid note payload");
  expect(result.output.visibility).toBe("internal");
});

test("status transitions follow the lifecycle", () => {
  expect(canTransition("submitted", "in_review")).toBe(true);
  expect(canTransition("awaiting_information", "completed")).toBe(true);
  expect(canTransition("completed", "in_review")).toBe(false);
  expect(canTransition("rejected", "submitted")).toBe(false);
  expect(isTerminalStatus("completed")).toBe(true);
  expect(isTerminalStatus("in_review")).toBe(false);
  expect(isOpenStatus("awaiting_information")).toBe(true);
});

test("references match the POPIA-YYYY-XXXXXX format", () => {
  expect(isPopiaReference("POPIA-2026-7K4Q2M")).toBe(true);
  expect(isPopiaReference("POPIA-26-7K4Q2M")).toBe(false);
  expect(isPopiaReference("POPIA-2026-7K4Q2")).toBe(false);
});
