import {
  array,
  maxLength,
  minLength,
  object,
  optional,
  picklist,
  pipe,
  safeParse,
  string,
  trim,
  type InferOutput,
} from "valibot";
import {
  extractCitationIds,
  extractFactstoreTables,
  type MediaDraftSource,
} from "@voltedge/media-contract";

/**
 * The single source of truth for the Rafiki content-analysis brief.
 *
 * `apps/api` generates and validates a brief against these shapes, and the
 * control centre renders it, so the model contract, persistence and UI cannot
 * drift. Every narrative item carries inline citations (`[source#chunk]`,
 * `[factstore:<table>]`) that are extracted with the media contract's helpers.
 */

/** The five review dimensions every brief covers, in display order. */
export const BRIEF_DIMENSIONS = [
  "key_findings",
  "statistics",
  "trends",
  "insights",
  "context",
] as const;

export type BriefDimension = (typeof BRIEF_DIMENSIONS)[number];

export const BRIEF_DIMENSION_LABELS: Record<BriefDimension, string> = {
  key_findings: "Key findings",
  statistics: "Key statistics",
  trends: "Trends",
  insights: "Insights",
  context: "Context",
};

/** One prose finding, insight or context note. Citations live inline in `detail`. */
export interface BriefNarrativeItem {
  title: string;
  detail: string;
}

/** One exact published figure the brief can stand behind. */
export interface BriefStatistic {
  label: string;
  value: string;
  unit?: string;
  period?: string;
  context?: string;
}

export const TREND_DIRECTIONS = ["up", "down", "stable", "mixed"] as const;

export type TrendDirection = (typeof TREND_DIRECTIONS)[number];

export const TREND_DIRECTION_LABELS: Record<TrendDirection, string> = {
  up: "Rising",
  down: "Falling",
  stable: "Stable",
  mixed: "Mixed",
};

/** A movement over time the report records (or a deliberate "no clear direction"). */
export interface BriefTrend {
  title: string;
  direction: TrendDirection;
  detail: string;
}

/** Everything one generated brief contains. */
export interface AnalysisBriefContent {
  summary: string;
  keyFindings: BriefNarrativeItem[];
  statistics: BriefStatistic[];
  trends: BriefTrend[];
  insights: BriefNarrativeItem[];
  context: BriefNarrativeItem[];
}

/** A grounded reference: a corpus passage or a published fact-store table. */
export type AnalysisBriefSource = MediaDraftSource;

export type BriefVerificationStatus = "verified" | "unverified" | "skipped";

export interface AnalysisBriefVerification {
  status: BriefVerificationStatus;
  /** Numbers in the brief that were not traceable to a retrieved passage or table. */
  unverified: string[];
}

/** A persisted brief as the control centre reads it. */
export interface AnalysisBrief {
  id: string;
  title: string;
  /** Indexed document source paths the brief was scoped to. */
  sources: string[];
  focus: string | null;
  content: AnalysisBriefContent;
  references: AnalysisBriefSource[];
  verification: AnalysisBriefVerification;
  model: string | null;
  createdByLabel: string;
  createdAt: string;
}

/** A compact row for the saved-briefs list. */
export interface AnalysisBriefSummary {
  id: string;
  title: string;
  sources: string[];
  createdAt: string;
  createdByLabel: string;
  /** Number of key findings plus statistics — a cheap sense of the brief's weight. */
  highlights: number;
}

export interface AnalysisBriefListResponse {
  briefs: AnalysisBriefSummary[];
  total: number;
}

export interface AnalysisBriefResponse {
  brief: AnalysisBrief;
}

/** One indexed document offered to the analysis builder. */
export interface IndexedDocumentSummary {
  source: string;
  title: string | null;
  characters: number;
  chunks: number;
}

export interface IndexedDocumentListResponse {
  documents: IndexedDocumentSummary[];
}

const itemLimit = (limit: number) => `Use ${limit} characters or fewer.`;

const narrativeSchema = object({
  title: pipe(
    string(),
    trim(),
    minLength(1, "Give this item a title."),
    maxLength(200, itemLimit(200)),
  ),
  detail: pipe(
    string(),
    trim(),
    minLength(1, "Describe the item."),
    maxLength(4000, itemLimit(4000)),
  ),
});

const statisticSchema = object({
  label: pipe(string(), trim(), minLength(1), maxLength(200, itemLimit(200))),
  value: pipe(string(), trim(), minLength(1), maxLength(120, itemLimit(120))),
  unit: optional(pipe(string(), trim(), maxLength(40, itemLimit(40)))),
  period: optional(pipe(string(), trim(), maxLength(120, itemLimit(120)))),
  context: optional(pipe(string(), trim(), maxLength(500, itemLimit(500)))),
});

const trendSchema = object({
  title: pipe(string(), trim(), minLength(1), maxLength(200, itemLimit(200))),
  direction: picklist(TREND_DIRECTIONS),
  detail: pipe(string(), trim(), minLength(1), maxLength(4000, itemLimit(4000))),
});

/**
 * Validates the model's structured brief. Unknown fields are dropped, and
 * empty dimensions are allowed: a short report may simply have no recorded
 * trend. An empty entire brief is still a valid parse — the service decides
 * whether it means an information gap.
 */
export const analysisBriefContentSchema = object({
  summary: pipe(string(), trim(), minLength(1), maxLength(4000, itemLimit(4000))),
  keyFindings: pipe(array(narrativeSchema), maxLength(12, "Use 12 key findings or fewer.")),
  statistics: pipe(array(statisticSchema), maxLength(20, "Use 20 statistics or fewer.")),
  trends: pipe(array(trendSchema), maxLength(10, "Use 10 trends or fewer.")),
  insights: pipe(array(narrativeSchema), maxLength(12, "Use 12 insights or fewer.")),
  context: pipe(array(narrativeSchema), maxLength(12, "Use 12 context notes or fewer.")),
});

/** Body of `POST /analysis/briefs`. */
export const createAnalysisBriefSchema = object({
  sources: pipe(
    array(pipe(string(), trim(), minLength(1))),
    minLength(1, "Choose at least one document to analyse."),
    maxLength(10, "Analyse at most 10 documents at once."),
  ),
  title: optional(pipe(string(), trim(), maxLength(200, itemLimit(200)))),
  focus: optional(pipe(string(), trim(), maxLength(500, itemLimit(500)))),
});

export type CreateAnalysisBriefInput = InferOutput<typeof createAnalysisBriefSchema>;

/** Query for `GET /analysis/briefs` (limit and offset are bounded by the controller). */
export const analysisBriefListQuerySchema = object({
  q: optional(pipe(string(), trim(), maxLength(200, itemLimit(200)))),
});

export type AnalysisBriefListQuery = InferOutput<typeof analysisBriefListQuerySchema>;

/**
 * Find the first JSON object in model output. Models sometimes wrap JSON in
 * prose or fences; this scans for the first `{` and returns the substring up to
 * its matching brace, respecting strings and escapes. Returns null when the
 * braces never balance.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

/**
 * Parse model output into a validated brief. Accepts a JSON string or an
 * already-parsed object; returns null when there is no object or it fails the
 * schema, so callers surface an error instead of persisting rubbish.
 */
export function parseBriefContent(raw: unknown): AnalysisBriefContent | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    const candidate = extractJsonObject(raw);
    if (!candidate) return null;
    try {
      value = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  const parsed = safeParse(analysisBriefContentSchema, value);
  return parsed.success ? (parsed.output as AnalysisBriefContent) : null;
}

/** Flatten a brief to searchable text: used for citation extraction and number checks. */
export function briefText(content: AnalysisBriefContent): string {
  const narrative = (items: BriefNarrativeItem[]) =>
    items.flatMap((item) => [item.title, item.detail]);
  const statistics = content.statistics.flatMap((stat) => [
    stat.label,
    stat.value,
    stat.unit,
    stat.period,
    stat.context,
  ]);
  const trends = content.trends.flatMap((trend) => [trend.title, trend.detail]);

  return [
    content.summary,
    ...narrative(content.keyFindings),
    ...statistics,
    ...trends,
    ...narrative(content.insights),
    ...narrative(content.context),
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n");
}

/** Every passage and published table the brief cites, so the API can resolve references. */
export function briefCitations(content: AnalysisBriefContent): {
  chunkIds: number[];
  tables: string[];
} {
  const text = briefText(content);
  return { chunkIds: extractCitationIds(text), tables: extractFactstoreTables(text) };
}

/** Number of findings plus statistics, used by the saved-briefs list. */
export function briefHighlightCount(content: AnalysisBriefContent): number {
  return content.keyFindings.length + content.statistics.length;
}

export function toBriefSummary(brief: AnalysisBrief): AnalysisBriefSummary {
  return {
    id: brief.id,
    title: brief.title,
    sources: brief.sources,
    createdAt: brief.createdAt,
    createdByLabel: brief.createdByLabel,
    highlights: briefHighlightCount(brief.content),
  };
}
