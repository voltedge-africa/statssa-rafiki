import {
  email,
  maxLength,
  minLength,
  nullable,
  object,
  optional,
  picklist,
  pipe,
  regex,
  string,
  trim,
  toLowerCase,
  toUpperCase,
  type InferOutput,
} from "valibot";

/** The POPIA data-subject rights a request can exercise. */
export const POPIA_REQUEST_TYPES = ["access", "correction", "deletion", "objection"] as const;

export type PopiaRequestType = (typeof POPIA_REQUEST_TYPES)[number];

export const POPIA_REQUEST_TYPE_LABELS: Record<PopiaRequestType, string> = {
  access: "Access my personal information",
  correction: "Correct my personal information",
  deletion: "Delete my personal information",
  objection: "Object to processing",
};

export const POPIA_REQUEST_TYPE_DESCRIPTIONS: Record<PopiaRequestType, string> = {
  access: "Ask for a copy of the personal information Stats SA holds about you.",
  correction:
    "Ask Stats SA to fix personal information that is inaccurate, misleading or out of date.",
  deletion: "Ask Stats SA to delete or destroy personal information it may no longer keep.",
  objection: "Ask Stats SA to stop processing your personal information.",
};

/** The lifecycle of a request, from receipt to closure. */
export const POPIA_REQUEST_STATUSES = [
  "submitted",
  "acknowledged",
  "in_review",
  "awaiting_information",
  "completed",
  "rejected",
  "withdrawn",
] as const;

export type PopiaRequestStatus = (typeof POPIA_REQUEST_STATUSES)[number];

export const POPIA_REQUEST_STATUS_LABELS: Record<PopiaRequestStatus, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  in_review: "In review",
  awaiting_information: "Awaiting information",
  completed: "Completed",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Statuses a request can move to from each status. Terminal statuses map to an empty list. */
export const POPIA_STATUS_TRANSITIONS: Record<PopiaRequestStatus, readonly PopiaRequestStatus[]> = {
  submitted: [
    "acknowledged",
    "in_review",
    "awaiting_information",
    "completed",
    "rejected",
    "withdrawn",
  ],
  acknowledged: ["in_review", "awaiting_information", "completed", "rejected", "withdrawn"],
  in_review: ["awaiting_information", "completed", "rejected", "withdrawn"],
  awaiting_information: ["in_review", "completed", "rejected", "withdrawn"],
  completed: [],
  rejected: [],
  withdrawn: [],
};

export function isTerminalStatus(status: PopiaRequestStatus): boolean {
  return POPIA_STATUS_TRANSITIONS[status].length === 0;
}

export function isOpenStatus(status: PopiaRequestStatus): boolean {
  return !isTerminalStatus(status);
}

export function canTransition(from: PopiaRequestStatus, to: PopiaRequestStatus): boolean {
  return from === to || POPIA_STATUS_TRANSITIONS[from].includes(to);
}

export function isPopiaRequestType(value: unknown): value is PopiaRequestType {
  return typeof value === "string" && (POPIA_REQUEST_TYPES as readonly string[]).includes(value);
}

export function isPopiaRequestStatus(value: unknown): value is PopiaRequestStatus {
  return typeof value === "string" && (POPIA_REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Entries in a request's audit trail. */
export const POPIA_EVENT_KINDS = [
  "submitted",
  "status_changed",
  "assigned",
  "note",
  "resolution",
] as const;

export type PopiaEventKind = (typeof POPIA_EVENT_KINDS)[number];

/** Whether a timeline entry is shown to the requester or kept for case workers only. */
export const POPIA_EVENT_VISIBILITIES = ["requester", "internal"] as const;

export type PopiaEventVisibility = (typeof POPIA_EVENT_VISIBILITIES)[number];

/**
 * POPIA requires a response as soon as reasonably practicable, and practice (aligned with PAIA)
 * is 30 calendar days from receipt.
 */
export const POPIA_RESPONSE_WINDOW_DAYS = 30;

export const POPIA_REFERENCE_PATTERN = /^POPIA-\d{4}-[A-Z0-9]{6}$/;

export function isPopiaReference(value: unknown): value is string {
  return typeof value === "string" && POPIA_REFERENCE_PATTERN.test(value);
}

const contactEmail = pipe(string(), trim(), toLowerCase(), email("Enter a valid email address."));

const optionalText = (limit: number) =>
  optional(pipe(string(), trim(), maxLength(limit, `Use ${limit} characters or fewer.`)));

/** Body of `POST /popia/requests`. */
export const submitPopiaRequestSchema = object({
  type: picklist(POPIA_REQUEST_TYPES, "Choose the right you want to exercise."),
  fullName: pipe(
    string(),
    trim(),
    minLength(2, "Enter your full name."),
    maxLength(120, "Use 120 characters or fewer."),
  ),
  email: contactEmail,
  phone: optionalText(40),
  details: pipe(
    string(),
    trim(),
    minLength(10, "Describe your request in at least 10 characters."),
    maxLength(5000, "Use 5000 characters or fewer."),
  ),
  desiredOutcome: optionalText(2000),
});

export type SubmitPopiaRequestInput = InferOutput<typeof submitPopiaRequestSchema>;

/** Body of `POST /popia/requests/track`. */
export const trackPopiaRequestSchema = object({
  reference: pipe(
    string(),
    trim(),
    toUpperCase(),
    regex(POPIA_REFERENCE_PATTERN, "Enter the reference exactly as it appears on your receipt."),
  ),
  email: contactEmail,
});

export type TrackPopiaRequestInput = InferOutput<typeof trackPopiaRequestSchema>;

/** Body of `PATCH /popia/requests/:reference` (case workers). */
export const updatePopiaRequestSchema = object({
  status: optional(picklist(POPIA_REQUEST_STATUSES)),
  assignedTo: optional(nullable(pipe(string(), trim(), maxLength(320)))),
  resolution: optional(nullable(pipe(string(), trim(), maxLength(5000)))),
  note: optional(pipe(string(), trim(), maxLength(2000))),
});

export type UpdatePopiaRequestInput = InferOutput<typeof updatePopiaRequestSchema>;

/** Body of `POST /popia/requests/:reference/notes` (case workers). */
export const createPopiaNoteSchema = object({
  message: pipe(
    string(),
    trim(),
    minLength(1, "Write a note before saving."),
    maxLength(5000, "Use 5000 characters or fewer."),
  ),
  visibility: optional(picklist(POPIA_EVENT_VISIBILITIES), "internal"),
});

export type CreatePopiaNoteInput = InferOutput<typeof createPopiaNoteSchema>;

/** A request as the requester sees it: no internal assignment or case-worker identities. */
export interface PopiaRequestPublic {
  reference: string;
  type: PopiaRequestType;
  status: PopiaRequestStatus;
  requesterName: string;
  details: string;
  desiredOutcome: string | null;
  resolution: string | null;
  dueAt: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface PopiaRequestEventView {
  id: string;
  kind: PopiaEventKind;
  visibility: PopiaEventVisibility;
  message: string | null;
  fromStatus: PopiaRequestStatus | null;
  toStatus: PopiaRequestStatus | null;
  actorLabel: string;
  createdAt: string;
}

/** A public request plus its requester-visible timeline. */
export interface PopiaRequestTracking extends PopiaRequestPublic {
  events: PopiaRequestEventView[];
}

/** A request as case workers see it: contact details, assignment and status. */
export interface PopiaRequestStaff extends PopiaRequestPublic {
  id: string;
  requesterEmail: string;
  requesterPhone: string | null;
  requesterId: string | null;
  assignedTo: string | null;
  assignedToEmail: string | null;
}

/** A staff request plus its full timeline, including internal notes. */
export interface PopiaRequestStaffDetail extends PopiaRequestStaff {
  events: PopiaRequestEventView[];
}

export interface PopiaRequestListResponse {
  requests: PopiaRequestStaff[];
  total: number;
}

export interface PopiaRequestResponse {
  request: PopiaRequestPublic;
}

export interface PopiaRequestTrackingResponse {
  request: PopiaRequestTracking;
}

export interface PopiaRequestStaffResponse {
  request: PopiaRequestStaffDetail;
}
