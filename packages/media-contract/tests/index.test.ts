import { expect, test } from "vite-plus/test";
import { safeParse } from "valibot";
import {
  approveMediaRequestSchema,
  canTransition,
  createMediaNoteSchema,
  extractCitationIds,
  isMediaReference,
  isOpenStatus,
  isTerminalStatus,
  MEDIA_REQUEST_STATUSES,
  rejectMediaRequestSchema,
  submitMediaRequestSchema,
  updateMediaRequestSchema,
} from "../src/index.ts";

test("exposes the media request lifecycle", () => {
  expect(MEDIA_REQUEST_STATUSES).toEqual([
    "submitted",
    "analysing",
    "awaiting_review",
    "information_gap",
    "approved",
    "rejected",
    "withdrawn",
  ]);
});

test("only staff decisions leave the review queue", () => {
  expect(canTransition("submitted", "analysing")).toBe(true);
  expect(canTransition("analysing", "awaiting_review")).toBe(true);
  expect(canTransition("analysing", "information_gap")).toBe(true);
  expect(canTransition("awaiting_review", "approved")).toBe(true);
  expect(canTransition("information_gap", "rejected")).toBe(true);
  expect(canTransition("approved", "awaiting_review")).toBe(false);
  expect(canTransition("rejected", "approved")).toBe(false);
  expect(isTerminalStatus("approved")).toBe(true);
  expect(isOpenStatus("awaiting_review")).toBe(true);
  expect(isOpenStatus("withdrawn")).toBe(false);
});

test("submission trims fields and accepts an ISO deadline", () => {
  const result = safeParse(submitMediaRequestSchema, {
    fullName: "  Sipho Dlamini ",
    claim: "  Is it true that inflation fell to 2% in July 2026? ",
    context: "  Following a report on a news site. ",
    outlet: "  The Daily Line ",
    deadline: "2026-09-20T10:00:00.000Z",
  });
  expect(result.success).toBe(true);
  expect(result.output).toMatchObject({
    fullName: "Sipho Dlamini",
    claim: "Is it true that inflation fell to 2% in July 2026?",
    context: "Following a report on a news site.",
    outlet: "The Daily Line",
  });
});

test("submission rejects a short claim and an invalid deadline", () => {
  expect(
    safeParse(submitMediaRequestSchema, {
      fullName: "Sipho Dlamini",
      claim: "too short",
    }).success,
  ).toBe(false);
  expect(
    safeParse(submitMediaRequestSchema, {
      fullName: "Sipho Dlamini",
      claim: "Is it true that inflation fell to 2%?",
      deadline: "next Tuesday",
    }).success,
  ).toBe(false);
});

test("updates can clear the assignee and carry a note", () => {
  const result = safeParse(updateMediaRequestSchema, {
    status: "awaiting_review",
    assignedTo: null,
    note: "  Picking this up. ",
  });
  expect(result.success).toBe(true);
  expect(result.output).toMatchObject({
    status: "awaiting_review",
    assignedTo: null,
    note: "Picking this up.",
  });
});

test("approval requires a substantive response", () => {
  expect(safeParse(approveMediaRequestSchema, { response: "short" }).success).toBe(false);
  expect(
    safeParse(approveMediaRequestSchema, {
      response: "Inflation was 3.2% in July 2026 [cpi#4].",
    }).success,
  ).toBe(true);
});

test("rejection requires a reason and notes validate visibility", () => {
  expect(safeParse(rejectMediaRequestSchema, { reason: "no" }).success).toBe(false);
  expect(safeParse(rejectMediaRequestSchema, { reason: "Outside our mandate." }).success).toBe(
    true,
  );
  expect(safeParse(createMediaNoteSchema, { message: "Checked with the CPI team." }).success).toBe(
    true,
  );
  expect(safeParse(createMediaNoteSchema, { message: "", visibility: "requester" }).success).toBe(
    false,
  );
});

test("recognises media references", () => {
  expect(isMediaReference("MEDIA-2026-ABC123")).toBe(true);
  expect(isMediaReference("POPIA-2026-ABC123")).toBe(false);
});

test("extracts the chunk ids cited in a response", () => {
  expect(
    extractCitationIds("Inflation eased to 3.2% [cpi-index#12] and food slowed [cpi#4]."),
  ).toEqual([12, 4]);
  expect(extractCitationIds("No citations here.")).toEqual([]);
});
