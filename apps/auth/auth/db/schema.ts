import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import {
  MEDIA_EVENT_KINDS,
  MEDIA_EVENT_VISIBILITIES,
  MEDIA_REQUEST_STATUSES,
} from "@voltedge/media-contract";
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
    deadline: timestamp("deadline", { withTimezone: true }),
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
