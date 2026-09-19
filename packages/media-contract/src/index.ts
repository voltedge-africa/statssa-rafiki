import {
  maxLength,
  minLength,
  nullable,
  object,
  optional,
  picklist,
  pipe,
  string,
  trim,
  type InferOutput,
} from "valibot";

/**
 * The lifecycle of a media fact-check request.
 *
 * A request is never answered automatically: the AI draft always lands in
 * `awaiting_review`, and only a Staff/Admin approval moves it to `approved`.
 * `information_gap` records that the approved sources could not support a draft,
 * so no unsupported content was generated.
 */
export const MEDIA_REQUEST_STATUSES = [
  "submitted",
  "analysing",
  "awaiting_review",
  "information_gap",
  "approved",
  "rejected",
  "withdrawn",
] as const;

export type MediaRequestStatus = (typeof MEDIA_REQUEST_STATUSES)[number];

export const MEDIA_REQUEST_STATUS_LABELS: Record<MediaRequestStatus, string> = {
  submitted: "Submitted",
  analysing: "Analysing",
  awaiting_review: "Awaiting review",
  information_gap: "Information gap",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const MEDIA_REQUEST_STATUS_DESCRIPTIONS: Record<MediaRequestStatus, string> = {
  submitted: "The request has been received and is queued for analysis.",
  analysing: "Approved sources are being searched and a draft response prepared.",
  awaiting_review: "A Stats SA communications official is reviewing the draft response.",
  information_gap:
    "Approved sources do not cover the query, so no response has been drafted. A communications official will follow up.",
  approved: "A Stats SA communications official has reviewed and approved the response.",
  rejected: "Stats SA has declined to respond to this request.",
  withdrawn: "The requester withdrew the request.",
};

/** Statuses a request can move to from each status. Terminal statuses map to an empty list. */
export const MEDIA_STATUS_TRANSITIONS: Record<MediaRequestStatus, readonly MediaRequestStatus[]> = {
  submitted: ["analysing", "withdrawn"],
  analysing: ["awaiting_review", "information_gap", "withdrawn"],
  information_gap: ["awaiting_review", "rejected", "withdrawn"],
  awaiting_review: ["approved", "information_gap", "rejected", "withdrawn"],
  approved: [],
  rejected: [],
  withdrawn: [],
};

export function isTerminalStatus(status: MediaRequestStatus): boolean {
  return MEDIA_STATUS_TRANSITIONS[status].length === 0;
}

export function isOpenStatus(status: MediaRequestStatus): boolean {
  return !isTerminalStatus(status);
}

export function canTransition(from: MediaRequestStatus, to: MediaRequestStatus): boolean {
  return from === to || MEDIA_STATUS_TRANSITIONS[from].includes(to);
}

export function isMediaRequestStatus(value: unknown): value is MediaRequestStatus {
  return typeof value === "string" && (MEDIA_REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Entries in a request's audit trail. */
export const MEDIA_EVENT_KINDS = [
  "submitted",
  "status_changed",
  "assigned",
  "note",
  "draft_generated",
  "approved",
  "rejected",
] as const;

export type MediaEventKind = (typeof MEDIA_EVENT_KINDS)[number];

/** Whether a timeline entry is shown to the requester or kept for reviewers only. */
export const MEDIA_EVENT_VISIBILITIES = ["requester", "internal"] as const;

export type MediaEventVisibility = (typeof MEDIA_EVENT_VISIBILITIES)[number];

export const MEDIA_REFERENCE_PATTERN = /^MEDIA-\d{4}-[A-Z0-9]{6}$/;

export function isMediaReference(value: unknown): value is string {
  return typeof value === "string" && MEDIA_REFERENCE_PATTERN.test(value);
}

const optionalText = (limit: number, message = `Use ${limit} characters or fewer.`) =>
  optional(pipe(string(), trim(), maxLength(limit, message)));

/** Body of `POST /media/requests`. The requester's email comes from their account. */
export const submitMediaRequestSchema = object({
  fullName: pipe(
    string(),
    trim(),
    minLength(2, "Enter your full name."),
    maxLength(120, "Use 120 characters or fewer."),
  ),
  claim: pipe(
    string(),
    trim(),
    minLength(10, "Describe the claim or question in at least 10 characters."),
    maxLength(2000, "Use 2000 characters or fewer."),
  ),
  context: optionalText(5000),
  outlet: optionalText(200),
});

export type SubmitMediaRequestInput = InferOutput<typeof submitMediaRequestSchema>;

/** Body of `PATCH /media/requests/:reference` (Staff/Admin). */
export const updateMediaRequestSchema = object({
  status: optional(picklist(MEDIA_REQUEST_STATUSES)),
  assignedTo: optional(nullable(pipe(string(), trim(), maxLength(320)))),
  note: optional(pipe(string(), trim(), maxLength(2000))),
  /** Persistent guidance the reviewer gives the drafting assistant. Empty clears it. */
  guidance: optional(pipe(string(), trim(), maxLength(2000, "Use 2000 characters or fewer."))),
});

export type UpdateMediaRequestInput = InferOutput<typeof updateMediaRequestSchema>;

/** Body of `POST /media/requests/:reference/regenerate` (Staff/Admin). */
export const regenerateMediaRequestSchema = object({
  guidance: optional(pipe(string(), trim(), maxLength(2000, "Use 2000 characters or fewer."))),
});

export type RegenerateMediaRequestInput = InferOutput<typeof regenerateMediaRequestSchema>;

/** Body of `POST /media/requests/:reference/approve` (Staff/Admin). */
export const approveMediaRequestSchema = object({
  response: pipe(
    string(),
    trim(),
    minLength(10, "Write the approved response before approving."),
    maxLength(10_000, "Use 10000 characters or fewer."),
  ),
  note: optional(pipe(string(), trim(), maxLength(2000))),
});

export type ApproveMediaRequestInput = InferOutput<typeof approveMediaRequestSchema>;

/** Body of `POST /media/requests/:reference/reject` (Staff/Admin). */
export const rejectMediaRequestSchema = object({
  reason: pipe(
    string(),
    trim(),
    minLength(5, "Give the requester a reason."),
    maxLength(2000, "Use 2000 characters or fewer."),
  ),
});

export type RejectMediaRequestInput = InferOutput<typeof rejectMediaRequestSchema>;

/** Body of `POST /media/requests/:reference/notes` (Staff/Admin). */
export const createMediaNoteSchema = object({
  message: pipe(
    string(),
    trim(),
    minLength(1, "Write a note before saving."),
    maxLength(5000, "Use 5000 characters or fewer."),
  ),
  visibility: optional(picklist(MEDIA_EVENT_VISIBILITIES), "internal"),
});

export type CreateMediaNoteInput = InferOutput<typeof createMediaNoteSchema>;

/** Query for `GET /media/requests/mine` (the owner's own list, used as the media-room sidebar). */
export const mediaRequestListQuerySchema = object({
  q: optional(pipe(string(), trim(), maxLength(200, "Use 200 characters or fewer."))),
  status: optional(picklist(MEDIA_REQUEST_STATUSES)),
});

export type MediaRequestListQuery = InferOutput<typeof mediaRequestListQuerySchema>;

/** A reference passage the AI draft was grounded in. */
export interface MediaDraftSource {
  chunkId: number;
  source: string;
  title: string | null;
  snippet: string;
  /** Retrieval similarity (0–1) of this passage to the request, when recorded. */
  similarity?: number;
}

/**
 * The AI-generated draft. It is never shown to the requester as an answer; it is
 * the starting point a communications official edits and approves. `gap` is set
 * (and `text` left null) when the approved sources do not support a response.
 */
export interface MediaAiDraft {
  text: string | null;
  sources: MediaDraftSource[];
  gap: string | null;
  model: string | null;
  generatedAt: string | null;
  /** Weakest recorded passage similarity; null when no passage carried a score. */
  confidence: number | null;
}

/** A request as its owner sees it: no draft, no assignment, no internal notes. */
export interface MediaRequestPublic {
  reference: string;
  status: MediaRequestStatus;
  requesterName: string;
  claim: string;
  context: string | null;
  outlet: string | null;
  approvedResponse: string | null;
  approvedSources: MediaDraftSource[];
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/** A compact row for owner-facing lists (the media-room sidebar). No requester identity. */
export interface MediaRequestSummary {
  reference: string;
  status: MediaRequestStatus;
  claim: string;
  createdAt: string;
  /** True once a Staff/Admin approval has released an official response. */
  hasResponse: boolean;
}

export function toRequestSummary(request: MediaRequestPublic): MediaRequestSummary {
  return {
    reference: request.reference,
    status: request.status,
    claim: request.claim,
    createdAt: request.createdAt,
    hasResponse: request.approvedResponse !== null,
  };
}

export interface MediaRequestSummaryListResponse {
  requests: MediaRequestSummary[];
  total: number;
}

/**
 * An approved, publishable response as listed in the media-room feed. Deliberately
 * omits the requester's name, email, outlet and context.
 */
export interface MediaOfficialResponse {
  reference: string;
  claim: string;
  response: string;
  sources: MediaDraftSource[];
  approvedAt: string;
}

export interface MediaOfficialResponseListResponse {
  responses: MediaOfficialResponse[];
  total: number;
}

export interface MediaRequestEventView {
  id: string;
  kind: MediaEventKind;
  visibility: MediaEventVisibility;
  message: string | null;
  fromStatus: MediaRequestStatus | null;
  toStatus: MediaRequestStatus | null;
  actorLabel: string;
  createdAt: string;
}

/** A public request plus its requester-visible timeline. */
export interface MediaRequestTracking extends MediaRequestPublic {
  events: MediaRequestEventView[];
}

/** A request as reviewers see it: requester contact details, assignment and the AI draft. */
export interface MediaRequestStaff extends MediaRequestPublic {
  id: string;
  requesterEmail: string;
  requesterId: string | null;
  assignedTo: string | null;
  assignedToEmail: string | null;
  draft: MediaAiDraft | null;
  /** Guidance the reviewer has given the drafting assistant; reused on every regenerate. */
  reviewerGuidance: string | null;
}

/** A staff request plus its full timeline, including internal notes. */
export interface MediaRequestStaffDetail extends MediaRequestStaff {
  events: MediaRequestEventView[];
}

export interface MediaRequestListResponse {
  requests: MediaRequestStaff[];
  total: number;
}

export interface MediaRequestResponse {
  request: MediaRequestPublic;
}

export interface MediaRequestTrackingResponse {
  request: MediaRequestTracking;
}

export interface MediaRequestStaffResponse {
  request: MediaRequestStaffDetail;
}

/**
 * Extract the `[source#chunk]` ids cited in a response body, so the API can map
 * them back to the passages a draft or approval relied on.
 */
export function extractCitationIds(text: string): number[] {
  const ids = new Set<number>();
  for (const match of text.matchAll(/\[([^[\]#]+)#(\d+)\]/g)) {
    const chunkId = Number(match[2]);
    if (Number.isInteger(chunkId)) ids.add(chunkId);
  }
  return [...ids];
}

/**
 * The weakest passage similarity that still counts as a green draft. Retrieval itself
 * admits passages down to 0.8, so this sits deliberately above that floor: a draft that
 * rests only on the weakest admitted passages escalates to a human rather than sailing
 * through on a technicality.
 */
export const DRAFT_CONFIDENCE_MIN = 0.85;

/**
 * Confidence for a draft or approved response: the weakest recorded passage
 * similarity, so one weak citation cannot hide behind strong ones. Null when no
 * passage carried a similarity (older drafts, or the model cited nothing).
 */
export function draftConfidence(sources: MediaDraftSource[]): number | null {
  const scores = sources
    .map((source) => source.similarity)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (scores.length === 0) return null;
  return Math.min(...scores);
}

export type MediaDraftCheckId =
  | "grounded"
  | "cited"
  | "valid-citations"
  | "fully-cited"
  | "confidence";

export interface MediaDraftCheck {
  id: MediaDraftCheckId;
  label: string;
  detail: string;
  passed: boolean;
  /** A gate must pass before release; an advisory is shown but never blocks. */
  severity: "gate" | "advisory";
}

export interface MediaDraftReview {
  checks: MediaDraftCheck[];
  /** True when every gate check passed. */
  passed: boolean;
}

const MIN_CITED_SENTENCE_WORDS = 6;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The post-generation enforcement gate. It runs before a draft or edited response
 * can be released: it proves the text is grounded, cites at least one retrieved
 * passage, and only cites passages that were actually retrieved. Uncited claim
 * sentences and weak passage similarity are surfaced rather than silently ignored.
 */
export function reviewDraft(text: string | null, sources: MediaDraftSource[]): MediaDraftReview {
  const body = text?.trim() ?? "";
  const cited = extractCitationIds(body);
  const known = new Set(sources.map((source) => source.chunkId));
  const unknown = cited.filter((id) => !known.has(id));
  const uncited = sentences(body).filter(
    (sentence) =>
      !/\[[^[\]#]+#\d+\]/.test(sentence) &&
      sentence.split(/\s+/).length >= MIN_CITED_SENTENCE_WORDS,
  );
  const confidence = draftConfidence(sources);

  const checks: MediaDraftCheck[] = [
    {
      id: "grounded",
      label: "Grounded in approved sources",
      detail:
        body && sources.length > 0
          ? `${sources.length} approved passage${sources.length === 1 ? "" : "s"} retrieved.`
          : "No approved passage supports this text.",
      passed: Boolean(body) && sources.length > 0,
      severity: "gate",
    },
    {
      id: "cited",
      label: "Cites at least one passage",
      detail:
        cited.length > 0
          ? `${cited.length} citation${cited.length === 1 ? "" : "s"} found.`
          : "No [source#chunk] citation found in the text.",
      passed: cited.length > 0,
      severity: "gate",
    },
    {
      id: "valid-citations",
      label: "Every citation was retrieved",
      detail:
        unknown.length === 0
          ? "All citations map to retrieved passages."
          : `Cites passages that were not retrieved: ${unknown.join(", ")}.`,
      passed: cited.length > 0 && unknown.length === 0,
      severity: "gate",
    },
    {
      id: "fully-cited",
      label: "Every claim sentence is cited",
      detail:
        uncited.length === 0
          ? "All claim sentences cite a passage."
          : `${uncited.length} sentence${uncited.length === 1 ? "" : "s"} without a citation.`,
      passed: uncited.length === 0,
      severity: "advisory",
    },
    {
      id: "confidence",
      label: "Passage confidence is sufficient",
      detail:
        confidence === null
          ? "Passage similarity was not recorded; gate skipped."
          : `Weakest source passage is ${confidence.toFixed(2)} (minimum ${DRAFT_CONFIDENCE_MIN.toFixed(2)}).`,
      passed: confidence === null || confidence >= DRAFT_CONFIDENCE_MIN,
      severity: "gate",
    },
  ];

  return { checks, passed: checks.every((check) => check.severity !== "gate" || check.passed) };
}
