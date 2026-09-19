import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import {
  MEDIA_EVENT_KINDS,
  MEDIA_EVENT_VISIBILITIES,
  MEDIA_REQUEST_STATUSES,
} from "@voltedge/media-contract";
import type { AnalysisBriefContent, AnalysisBriefSource } from "@voltedge/brief-contract";
import {
  POPIA_EVENT_KINDS,
  POPIA_EVENT_VISIBILITIES,
  POPIA_REQUEST_STATUSES,
  POPIA_REQUEST_TYPES,
} from "@voltedge/popia-contract";

// Kept in step with ROLES in @voltedge/auth-contract. Inlined because drizzle-kit loads this
// schema in CommonJS, and the auth contract's build pulls in OpenAuth, which it cannot require.
const ROLE_VALUES = ["Press", "Staff", "Admin"] as const;

export const roleEnum = pgEnum("role", ROLE_VALUES);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: roleEnum("role").notNull().default("Press"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

export const popiaRequestTypeEnum = pgEnum("popia_request_type", POPIA_REQUEST_TYPES);
export const popiaRequestStatusEnum = pgEnum("popia_request_status", POPIA_REQUEST_STATUSES);
export const popiaEventKindEnum = pgEnum("popia_event_kind", POPIA_EVENT_KINDS);
export const popiaEventVisibilityEnum = pgEnum("popia_event_visibility", POPIA_EVENT_VISIBILITIES);

export const popiaRequests = pgTable(
  "popia_requests",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull().unique(),
    type: popiaRequestTypeEnum("type").notNull(),
    status: popiaRequestStatusEnum("status").notNull().default("submitted"),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email").notNull(),
    requesterPhone: text("requester_phone"),
    requesterId: text("requester_id").references(() => users.id, { onDelete: "set null" }),
    details: text("details").notNull(),
    desiredOutcome: text("desired_outcome"),
    resolution: text("resolution"),
    assignedTo: text("assigned_to").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("popia_requests_status_idx").on(table.status),
    index("popia_requests_email_idx").on(table.requesterEmail),
    index("popia_requests_assigned_idx").on(table.assignedTo),
  ],
);

export type PopiaRequestRow = typeof popiaRequests.$inferSelect;
export type NewPopiaRequestRow = typeof popiaRequests.$inferInsert;

export const popiaRequestEvents = pgTable(
  "popia_request_events",
  {
    id: text("id").primaryKey(),
    seq: integer("seq").generatedAlwaysAsIdentity(),
    requestId: text("request_id")
      .notNull()
      .references(() => popiaRequests.id, { onDelete: "cascade" }),
    kind: popiaEventKindEnum("kind").notNull(),
    visibility: popiaEventVisibilityEnum("visibility").notNull().default("internal"),
    fromStatus: popiaRequestStatusEnum("from_status"),
    toStatus: popiaRequestStatusEnum("to_status"),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("popia_request_events_request_idx").on(table.requestId, table.seq)],
);

export type PopiaRequestEventRow = typeof popiaRequestEvents.$inferSelect;
export type NewPopiaRequestEventRow = typeof popiaRequestEvents.$inferInsert;

export const mediaRequestStatusEnum = pgEnum("media_request_status", MEDIA_REQUEST_STATUSES);
export const mediaEventKindEnum = pgEnum("media_event_kind", MEDIA_EVENT_KINDS);
export const mediaEventVisibilityEnum = pgEnum("media_event_visibility", MEDIA_EVENT_VISIBILITIES);

export const mediaRequests = pgTable(
  "media_requests",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull().unique(),
    status: mediaRequestStatusEnum("status").notNull().default("submitted"),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email").notNull(),
    requesterId: text("requester_id").references(() => users.id, { onDelete: "set null" }),
    outlet: text("outlet"),
    claim: text("claim").notNull(),
    context: text("context"),
    reviewerGuidance: text("reviewer_guidance"),
    aiDraft: text("ai_draft"),
    aiSources: jsonb("ai_sources"),
    aiGap: text("ai_gap"),
    aiModel: text("ai_model"),
    aiGeneratedAt: timestamp("ai_generated_at", { withTimezone: true }),
    approvedResponse: text("approved_response"),
    approvedSources: jsonb("approved_sources"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by").references(() => users.id, { onDelete: "set null" }),
    rejectedReason: text("rejected_reason"),
    assignedTo: text("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("media_requests_status_idx").on(table.status),
    index("media_requests_email_idx").on(table.requesterEmail),
    index("media_requests_assigned_idx").on(table.assignedTo),
  ],
);

export type MediaRequestRow = typeof mediaRequests.$inferSelect;
export type NewMediaRequestRow = typeof mediaRequests.$inferInsert;

export const mediaRequestEvents = pgTable(
  "media_request_events",
  {
    id: text("id").primaryKey(),
    seq: integer("seq").generatedAlwaysAsIdentity(),
    requestId: text("request_id")
      .notNull()
      .references(() => mediaRequests.id, { onDelete: "cascade" }),
    kind: mediaEventKindEnum("kind").notNull(),
    visibility: mediaEventVisibilityEnum("visibility").notNull().default("internal"),
    fromStatus: mediaRequestStatusEnum("from_status"),
    toStatus: mediaRequestStatusEnum("to_status"),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("media_request_events_request_idx").on(table.requestId, table.seq)],
);

export type MediaRequestEventRow = typeof mediaRequestEvents.$inferSelect;
export type NewMediaRequestEventRow = typeof mediaRequestEvents.$inferInsert;

// ---------------------------------------------------------------------------
// AI telemetry (model governance)
//
// Written by apps/api from pi telemetry spans. Holds only what the model did,
// which tools it used and how the call performed: never prompts, completions,
// tool arguments or tool output. See apps/api/src/agent/telemetry.flatten.ts.
// ---------------------------------------------------------------------------

export const aiSpans = pgTable(
  "ai_spans",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    spanUid: uuid("span_uid").notNull().defaultRandom().unique(),
    parentUid: uuid("parent_uid"),
    sessionId: text("session_id"),
    name: text("name").notNull(),
    /** turn | model_request | tool | other */
    kind: text("kind").notNull().default("other"),
    feature: text("feature"),
    clientRole: text("client_role"),
    clientOrigin: text("client_origin"),
    provider: text("provider"),
    model: text("model"),
    responseModel: text("response_model"),
    operation: text("operation"),
    toolName: text("tool_name"),
    toolCallId: text("tool_call_id"),
    toolIsError: boolean("tool_is_error"),
    stopReason: text("stop_reason"),
    status: text("status").notNull().default("ok"),
    errorMessage: text("error_message"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    totalTokens: integer("total_tokens"),
    costUsd: numeric("cost_usd", { precision: 14, scale: 6 }),
    chunkCount: integer("chunk_count"),
    timeToFirstChunkMs: integer("time_to_first_chunk_ms"),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    attributes: jsonb("attributes").notNull().default({}),
    events: jsonb("events").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ai_spans_session_idx").on(table.sessionId, table.startedAt),
    index("ai_spans_kind_idx").on(table.kind, table.startedAt),
    index("ai_spans_name_idx").on(table.name),
    index("ai_spans_model_idx").on(table.model, table.startedAt),
    index("ai_spans_tool_idx").on(table.toolName, table.startedAt),
    index("ai_spans_feature_idx").on(table.feature, table.startedAt),
    index("ai_spans_role_idx").on(table.clientRole, table.startedAt),
    index("ai_spans_status_idx").on(table.status),
    index("ai_spans_created_idx").on(table.createdAt),
  ],
);

export type AiSpanRow = typeof aiSpans.$inferSelect;
export type NewAiSpanRow = typeof aiSpans.$inferInsert;

/** Per-model-call governance view (`kind = 'model_request'`). */
export const aiModelUsage = pgView("ai_model_usage").as((qb) =>
  qb
    .select({
      spanUid: aiSpans.spanUid,
      parentUid: aiSpans.parentUid,
      sessionId: aiSpans.sessionId,
      feature: aiSpans.feature,
      clientRole: aiSpans.clientRole,
      clientOrigin: aiSpans.clientOrigin,
      provider: aiSpans.provider,
      model: aiSpans.model,
      responseModel: aiSpans.responseModel,
      operation: aiSpans.operation,
      stopReason: aiSpans.stopReason,
      status: aiSpans.status,
      errorMessage: aiSpans.errorMessage,
      inputTokens: aiSpans.inputTokens,
      outputTokens: aiSpans.outputTokens,
      cacheReadTokens: aiSpans.cacheReadTokens,
      cacheWriteTokens: aiSpans.cacheWriteTokens,
      reasoningTokens: aiSpans.reasoningTokens,
      totalTokens: aiSpans.totalTokens,
      costUsd: aiSpans.costUsd,
      chunkCount: aiSpans.chunkCount,
      timeToFirstChunkMs: aiSpans.timeToFirstChunkMs,
      durationMs: aiSpans.durationMs,
      startedAt: aiSpans.startedAt,
      endedAt: aiSpans.endedAt,
    })
    .from(aiSpans)
    .where(eq(aiSpans.kind, "model_request")),
);

/** Per-tool-call governance view (`kind = 'tool'`). */
export const aiToolUsage = pgView("ai_tool_usage").as((qb) =>
  qb
    .select({
      spanUid: aiSpans.spanUid,
      parentUid: aiSpans.parentUid,
      sessionId: aiSpans.sessionId,
      feature: aiSpans.feature,
      clientRole: aiSpans.clientRole,
      toolName: aiSpans.toolName,
      toolCallId: aiSpans.toolCallId,
      toolIsError: aiSpans.toolIsError,
      status: aiSpans.status,
      errorMessage: aiSpans.errorMessage,
      durationMs: aiSpans.durationMs,
      startedAt: aiSpans.startedAt,
      endedAt: aiSpans.endedAt,
    })
    .from(aiSpans)
    .where(eq(aiSpans.kind, "tool")),
);

// ---------------------------------------------------------------------------
// AI governance settings (singleton)
//
// One operator-editable row read by every enforcement point: the draft gate's
// confidence floor, the agent's tool allowlist and the generation kill switch.
// `policies` and `incident_response` are maintained copy for the governance page.
// ---------------------------------------------------------------------------

export const governanceSettings = pgTable("governance_settings", {
  id: text("id").primaryKey().default("default"),
  confidenceMin: numeric("confidence_min", { precision: 3, scale: 2 }).notNull().default("0.85"),
  generationEnabled: boolean("generation_enabled").notNull().default(true),
  enabledTools: jsonb("enabled_tools").$type<string[]>().notNull().default([]),
  policies: jsonb("policies")
    .$type<{ area: string; rule: string; enforcement: string }[]>()
    .notNull()
    .default([]),
  incidentResponse: jsonb("incident_response").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export type GovernanceSettingsRow = typeof governanceSettings.$inferSelect;
export type NewGovernanceSettingsRow = typeof governanceSettings.$inferInsert;

// ---------------------------------------------------------------------------
// Content-analysis briefs
//
// A persisted, cited brief generated from selected indexed documents. The
// brief itself is jsonb (validated against @voltedge/brief-contract before it
// is written); references carry the passage/table provenance for audit.
// ---------------------------------------------------------------------------

export const briefVerificationStatusEnum = pgEnum("brief_verification_status", [
  "verified",
  "unverified",
  "skipped",
]);

export const analysisBriefs = pgTable(
  "analysis_briefs",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    sources: jsonb("sources").$type<string[]>().notNull(),
    focus: text("focus"),
    content: jsonb("content").$type<AnalysisBriefContent | null>(),
    references: jsonb("references").$type<AnalysisBriefSource[]>().notNull().default([]),
    verificationStatus: briefVerificationStatusEnum("verification_status")
      .notNull()
      .default("skipped"),
    unverifiedNumbers: jsonb("unverified_numbers").$type<string[]>().notNull().default([]),
    aiModel: text("ai_model"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdByLabel: text("created_by_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("analysis_briefs_created_idx").on(table.createdAt)],
);

export type AnalysisBriefRow = typeof analysisBriefs.$inferSelect;
export type NewAnalysisBriefRow = typeof analysisBriefs.$inferInsert;

// ---------------------------------------------------------------------------
// Knowledge-gap log
//
// Ungrounded queries from the public chat and the media fact-check desk, plus
// the embedding-clustered categories they roll up into. No user identity is
// stored: role and origin host only, and media rows point at their request.
// The `vector` extension is enabled by the matching migration.
// ---------------------------------------------------------------------------

export const gapSurfaceEnum = pgEnum("gap_surface", ["chat", "media_draft"]);
export const gapLabelSourceEnum = pgEnum("gap_label_source", ["auto", "model"]);

export const gapCategories = pgTable("gap_categories", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  description: text("description"),
  labelSource: gapLabelSourceEnum("label_source").notNull().default("auto"),
  centroid: vector("centroid", { dimensions: 384 }),
  queryCount: integer("query_count").notNull().default(0),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
});

export const gapQueries = pgTable(
  "gap_queries",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id").references(() => gapCategories.id, { onDelete: "set null" }),
    surface: gapSurfaceEnum("surface").notNull(),
    query: text("query").notNull(),
    reference: text("reference"),
    outlet: text("outlet"),
    role: text("role"),
    origin: text("origin"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("gap_queries_created_idx").on(table.createdAt),
    index("gap_queries_category_idx").on(table.categoryId),
  ],
);

export type GapCategoryRow = typeof gapCategories.$inferSelect;
export type NewGapCategoryRow = typeof gapCategories.$inferInsert;
export type GapQueryRow = typeof gapQueries.$inferSelect;
export type NewGapQueryRow = typeof gapQueries.$inferInsert;
