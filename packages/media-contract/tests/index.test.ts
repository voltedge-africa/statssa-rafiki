import { expect, test } from "vite-plus/test";
import { safeParse } from "valibot";
import {
  approveMediaRequestSchema,
  canTransition,
  createMediaNoteSchema,
  DRAFT_CONFIDENCE_MIN,
  draftConfidence,
  extractCitationIds,
  isMediaReference,
  isOpenStatus,
  isTerminalStatus,
  MEDIA_REQUEST_STATUSES,
  mediaRequestListQuerySchema,
  regenerateMediaRequestSchema,
  rejectMediaRequestSchema,
  reviewDraft,
  submitMediaRequestSchema,
  toRequestSummary,
  type MediaDraftSource,
  type MediaRequestPublic,
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

test("submission trims fields", () => {
  const result = safeParse(submitMediaRequestSchema, {
    fullName: "  Sipho Dlamini ",
    claim: "  Is it true that inflation fell to 2% in July 2026? ",
    context: "  Following a report on a news site. ",
    outlet: "  The Daily Line ",
  });
  expect(result.success).toBe(true);
  expect(result.output).toMatchObject({
    fullName: "Sipho Dlamini",
    claim: "Is it true that inflation fell to 2% in July 2026?",
    context: "Following a report on a news site.",
    outlet: "The Daily Line",
  });
});

test("submission rejects a short claim", () => {
  expect(
    safeParse(submitMediaRequestSchema, {
      fullName: "Sipho Dlamini",
      claim: "too short",
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

test("reviewer guidance is optional, trimmed and bounded", () => {
  const empty = safeParse(regenerateMediaRequestSchema, {});
  expect(empty.success).toBe(true);
  if (!empty.success) return;
  expect(empty.output.guidance).toBeUndefined();

  const guided = safeParse(regenerateMediaRequestSchema, {
    guidance: "  Emphasise core inflation alongside the headline figure.  ",
  });
  expect(guided.success).toBe(true);
  if (!guided.success) return;
  expect(guided.output.guidance).toBe("Emphasise core inflation alongside the headline figure.");

  expect(safeParse(regenerateMediaRequestSchema, { guidance: "x".repeat(2001) }).success).toBe(
    false,
  );
  expect(safeParse(updateMediaRequestSchema, { guidance: "  " }).output).toMatchObject({
    guidance: "",
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

function source(similarity?: number): MediaDraftSource {
  return {
    chunkId: 4,
    source: "sample/cpi-index.md",
    title: "CPI index",
    snippet: "Headline inflation was 3.2% in July 2026.",
    ...(similarity === undefined ? {} : { similarity }),
  };
}

test("draft confidence is the weakest recorded passage similarity, or null", () => {
  expect(draftConfidence([])).toBeNull();
  expect(draftConfidence([source(), source()])).toBeNull();
  expect(draftConfidence([source(0.91)])).toBeCloseTo(0.91);
  expect(draftConfidence([source(0.9), source(0.82)])).toBeCloseTo(0.82);
});

test("a grounded, fully cited draft passes the enforcement gate", () => {
  const review = reviewDraft("Headline inflation was 3.2% in July 2026 [cpi-index#4].", [
    source(0.9),
  ]);
  expect(review.passed).toBe(true);
  expect(review.checks.every((check) => check.passed)).toBe(true);
  expect(review.checks.find((check) => check.id === "grounded")?.severity).toBe("gate");
});

test("an uncited sentence is an advisory warning, not a hard block", () => {
  const review = reviewDraft(
    "Inflation was 3.2% in July 2026 [cpi-index#4]. This matters for household budgets across the country.",
    [source(0.9)],
  );
  const check = review.checks.find((item) => item.id === "fully-cited");
  expect(check?.passed).toBe(false);
  expect(check?.severity).toBe("advisory");
  expect(review.passed).toBe(true);
});

test("a draft with no citation fails the gate", () => {
  const review = reviewDraft("Inflation was 3.2% in July 2026.", [source(0.9)]);
  expect(review.checks.find((check) => check.id === "cited")?.passed).toBe(false);
  expect(review.passed).toBe(false);
});

test("a citation to a source that was not retrieved fails the gate", () => {
  const review = reviewDraft("Inflation was 3.2% [other#99].", [source(0.9)]);
  expect(review.checks.find((check) => check.id === "valid-citations")?.passed).toBe(false);
  expect(review.passed).toBe(false);
});

test("an empty draft or no sources fails the grounded gate", () => {
  expect(reviewDraft(null, [source(0.9)]).passed).toBe(false);
  expect(reviewDraft("Inflation was 3.2% [cpi-index#4].", []).passed).toBe(false);
});

test("a weak passage similarity fails the confidence gate", () => {
  // 0.82 clears retrieval's 0.8 admission floor but sits below the escalation floor,
  // so this is exactly the draft the confidence gate exists to catch.
  expect(DRAFT_CONFIDENCE_MIN).toBeGreaterThan(0.8);
  const review = reviewDraft("Inflation was 3.2% [cpi-index#4].", [source(0.82)]);
  expect(review.checks.find((check) => check.id === "confidence")?.passed).toBe(false);
  expect(review.passed).toBe(false);
});

test("the confidence gate accepts an operator-set threshold", () => {
  const relaxed = reviewDraft("Inflation was 3.2% [cpi-index#4].", [source(0.82)], {
    confidenceMin: 0.8,
  });
  expect(relaxed.checks.find((check) => check.id === "confidence")?.passed).toBe(true);
  expect(relaxed.passed).toBe(true);

  const strict = reviewDraft("Inflation was 3.2% [cpi-index#4].", [source(0.9)], {
    confidenceMin: 0.95,
  });
  expect(strict.checks.find((check) => check.id === "confidence")?.passed).toBe(false);
  expect(strict.passed).toBe(false);
});

test("missing similarity leaves the confidence gate passing with a note", () => {
  const review = reviewDraft("Inflation was 3.2% [cpi-index#4].", [source()]);
  const check = review.checks.find((item) => item.id === "confidence");
  expect(check?.passed).toBe(true);
  expect(check?.detail).toMatch(/not recorded/i);
});

const publicRequest: MediaRequestPublic = {
  reference: "MEDIA-2026-ABC123",
  status: "awaiting_review",
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

test("summarises a request without leaking reviewer-only fields", () => {
  const approved: MediaRequestPublic = {
    ...publicRequest,
    status: "approved",
    approvedResponse: "3.2%",
  };
  expect(toRequestSummary(approved)).toEqual({
    reference: "MEDIA-2026-ABC123",
    status: "approved",
    claim: "Is it true that headline inflation fell to 2% in July 2026?",
    createdAt: "2026-09-18T00:00:00.000Z",
    hasResponse: true,
  });
  expect(toRequestSummary(publicRequest).hasResponse).toBe(false);
});

test("validates the owner list query and rejects an unknown status", () => {
  const parsed = safeParse(mediaRequestListQuerySchema, {
    q: "  inflation ",
    status: "approved",
  });
  expect(parsed.success).toBe(true);
  expect(parsed.output).toEqual({ q: "inflation", status: "approved" });

  expect(safeParse(mediaRequestListQuerySchema, { status: "banana" }).success).toBe(false);
});
