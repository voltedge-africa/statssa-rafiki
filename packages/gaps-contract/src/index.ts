import { maxLength, object, optional, pipe, string, trim, type InferOutput } from "valibot";

/**
 * The single source of truth for the Rafiki knowledge-gap log.
 *
 * A gap is a Stats SA content query that received no grounded answer because the
 * approved corpus (and published tables) could not support one. Gaps are
 * recorded from the public chat and the media fact-check desk, embedded with the
 * local retrieval model and grouped into categories, so the control centre can
 * see what the public and press are asking that the knowledge base does not yet
 * cover.
 */

/** The surfaces that report ungrounded queries. */
export const GAP_SURFACES = ["chat", "media_draft"] as const;

export type GapSurface = (typeof GAP_SURFACES)[number];

export const GAP_SURFACE_LABELS: Record<GapSurface, string> = {
  chat: "Public chat",
  media_draft: "Media fact-check",
};

export function isGapSurface(value: unknown): value is GapSurface {
  return typeof value === "string" && (GAP_SURFACES as readonly string[]).includes(value);
}

/** Whether a category label was derived from the query or written by the model. */
export const GAP_LABEL_SOURCES = ["auto", "model"] as const;
export type GapLabelSource = (typeof GAP_LABEL_SOURCES)[number];

/** One logged ungrounded query. */
export interface GapQuery {
  id: string;
  categoryId: string | null;
  surface: GapSurface;
  query: string;
  /** Media fact-check reference, when the gap came from a request. */
  reference: string | null;
  outlet: string | null;
  /** Portal role that asked (never a user id). */
  role: string | null;
  /** Host the query reached the API from, e.g. localhost:3003. */
  origin: string | null;
  /** Why the query could not be answered (retrieval miss, confidence floor, ...). */
  reason: string | null;
  createdAt: string;
}

/** A group of semantically similar ungrounded queries. */
export interface GapCategory {
  id: string;
  label: string;
  description: string | null;
  queryCount: number;
  firstSeen: string;
  lastSeen: string;
  /** Surfaces that contributed at least one query to the category. */
  surfaces: GapSurface[];
}

export interface GapCategoryListResponse {
  categories: GapCategory[];
  total: number;
}

export interface GapQueryListResponse {
  queries: GapQuery[];
  total: number;
}

export interface GapDayCount {
  date: string;
  count: number;
}

export interface GapCategoryCount {
  id: string;
  label: string;
  queryCount: number;
  /** Share of the window's gaps, or null when the window is empty. */
  share: number | null;
  lastSeen: string;
}

export interface GapSurfaceCount {
  surface: GapSurface;
  count: number;
}

export interface GapOutletCount {
  outlet: string;
  count: number;
}

/**
 * The body of `GET /gaps/summary`: everything the knowledge-gap page renders for
 * one window. Daily counts are zero-filled and UTC-aligned.
 */
export interface GapSummary {
  generatedAt: string;
  days: number;
  from: string;
  to: string;
  /** Ungrounded queries logged in the window. */
  total: number;
  /** Categories with at least one query, all time. */
  categories: number;
  /** Categories first seen in the window. */
  newCategories: number;
  daily: GapDayCount[];
  surfaces: GapSurfaceCount[];
  topCategories: GapCategoryCount[];
  /** Outlets behind media fact-check gaps in the window, busiest first. */
  topOutlets: GapOutletCount[];
}

/** Query for `GET /gaps/categories` (limit and offset are bounded by the controller). */
export const gapCategoryListQuerySchema = object({
  q: optional(pipe(string(), trim(), maxLength(200, "Use 200 characters or fewer."))),
});

export type GapCategoryListQuery = InferOutput<typeof gapCategoryListQuerySchema>;

/**
 * Derive a deterministic fallback category label from a query: the first
 * sentence-ish fragment, title-cased, so a category is readable even when the
 * labelling model is unavailable.
 */
export function labelFromQuery(query: string): string {
  const clean = query.replace(/\s+/g, " ").trim();
  if (!clean) return "Uncategorised query";

  const [first] = clean.split(/(?<=[.!?])\s/);
  const fragment = (first ?? clean).slice(0, 60).trim();
  const trimmed = fragment.replace(/[\s.,;:!?-]+$/, "");
  if (!trimmed) return "Uncategorised query";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Share of a whole, or null when nothing was recorded — never a fake zero rate.
 */
export function share(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}
