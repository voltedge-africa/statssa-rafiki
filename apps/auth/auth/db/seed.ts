import { randomUUID } from "node:crypto";
import type { Role } from "@voltedge/auth-contract";
import type { MediaDraftSource, MediaRequestStatus } from "@voltedge/media-contract";
import type {
  PopiaEventKind,
  PopiaEventVisibility,
  PopiaRequestStatus,
  PopiaRequestType,
} from "@voltedge/popia-contract";
import { like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { orDefault } from "../env.ts";
import {
  mediaRequestEvents,
  mediaRequests,
  popiaRequestEvents,
  popiaRequests,
  users,
} from "./schema.ts";

/**
 * Seeds the request database with demo users and example POPIA and media requests.
 *
 * Safe to re-run: seeded rows are identified by a `SEED` marker in their reference and are
 * deleted before they are re-inserted. Real data is left untouched. Passwords are not seeded
 * (OpenAuth stores credentials outside Postgres) - register through the UI with any of the
 * seeded emails and the role is already set.
 *
 * Run with `vp run db:seed` from the repo root.
 */

const SEED_MARKER_POPIA = "POPIA-%-SEED%";
const SEED_MARKER_MEDIA = "MEDIA-%-SEED%";

const connectionString = orDefault(
  "DATABASE_URL",
  "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth",
);

const client = postgres(connectionString, { max: 1, onnotice: () => undefined });
const db = drizzle(client);

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = new Date();
const inDays = (days: number) => new Date(now.getTime() + days * DAY);
const agoDays = (days: number) => new Date(now.getTime() - days * DAY);
const agoHours = (hours: number) => new Date(now.getTime() - hours * HOUR);

const userId = (email: string) => `user_${email.trim().toLowerCase()}`;

const STAFF = userId("staff@statssa.gov.za");
const NALEDI = userId("naledi.khumalo@statssa.gov.za");
const ADMIN = userId("admin@statssa.gov.za");
const PRESS = userId("press@example.co.za");
const AMARA = userId("amara.naidoo@example.co.za");
const GRACE = userId("grace.nkosi@example.co.za");

const SEED_USERS: ReadonlyArray<{ email: string; role: Role }> = [
  { email: "admin@statssa.gov.za", role: "Admin" },
  { email: "staff@statssa.gov.za", role: "Staff" },
  { email: "naledi.khumalo@statssa.gov.za", role: "Staff" },
  { email: "press@example.co.za", role: "Press" },
  { email: "amara.naidoo@example.co.za", role: "Press" },
  { email: "grace.nkosi@example.co.za", role: "Press" },
];

interface PopiaEventSeed {
  kind: PopiaEventKind;
  visibility?: PopiaEventVisibility;
  fromStatus?: PopiaRequestStatus | null;
  toStatus?: PopiaRequestStatus | null;
  actorId?: string | null;
  actorLabel: string;
  message?: string | null;
  createdAt: Date;
}

interface PopiaSeed {
  reference: string;
  type: PopiaRequestType;
  status: PopiaRequestStatus;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string | null;
  requesterId?: string | null;
  details: string;
  desiredOutcome?: string | null;
  resolution?: string | null;
  assignedTo?: string | null;
  dueAt: Date;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null;
  events: PopiaEventSeed[];
}

const POPIA_SEEDS: PopiaSeed[] = [
  {
    reference: "POPIA-2026-SEED01",
    type: "access",
    status: "submitted",
    requesterName: "Sipho Dlamini",
    requesterEmail: "press@example.co.za",
    requesterPhone: "+27 82 555 0142",
    requesterId: PRESS,
    details:
      "I would like a copy of all personal information Stats SA holds about me, including my response to the 2022 census employment questions.",
    desiredOutcome: "A copy of my records and confirmation of what is held.",
    dueAt: inDays(30),
    createdAt: agoHours(3),
    updatedAt: agoHours(3),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Sipho Dlamini",
        message: "Request received.",
        createdAt: agoHours(3),
      },
    ],
  },
  {
    reference: "POPIA-2026-SEED02",
    type: "correction",
    status: "in_review",
    requesterName: "Lerato Mahlangu",
    requesterEmail: "lerato.mahlangu@example.co.za",
    requesterPhone: "+27 71 555 0198",
    details:
      "My date of birth is recorded incorrectly on the household record from the 2022 census. It shows 1989 instead of 1990.",
    desiredOutcome: "Correct the date of birth on my record.",
    assignedTo: STAFF,
    dueAt: inDays(18),
    createdAt: agoDays(6),
    updatedAt: agoDays(1),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Lerato Mahlangu",
        message: "Request received.",
        createdAt: agoDays(6),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "acknowledged",
        actorLabel: "staff@statssa.gov.za",
        message: "Acknowledged and assigned for review.",
        createdAt: agoDays(5),
      },
      {
        kind: "assigned",
        actorLabel: "staff@statssa.gov.za",
        message: "Assigned to staff@statssa.gov.za.",
        createdAt: agoDays(5),
      },
      {
        kind: "status_changed",
        fromStatus: "acknowledged",
        toStatus: "in_review",
        actorLabel: "staff@statssa.gov.za",
        createdAt: agoDays(1),
      },
      {
        kind: "note",
        actorLabel: "staff@statssa.gov.za",
        message: "Identity documents received; correction queued with the records team.",
        createdAt: agoDays(1),
      },
    ],
  },
  {
    reference: "POPIA-2026-SEED03",
    type: "deletion",
    status: "awaiting_information",
    requesterName: "Ahmed Patel",
    requesterEmail: "ahmed.patel@example.co.za",
    requesterPhone: "+27 83 555 0177",
    details:
      "Please delete the cellphone number captured during the Labour Force Survey call in March 2026.",
    desiredOutcome: "Delete my phone number from your systems.",
    assignedTo: NALEDI,
    dueAt: inDays(10),
    createdAt: agoDays(12),
    updatedAt: agoDays(2),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Ahmed Patel",
        message: "Request received.",
        createdAt: agoDays(12),
      },
      {
        kind: "assigned",
        actorLabel: "naledi.khumalo@statssa.gov.za",
        message: "Assigned to naledi.khumalo@statssa.gov.za.",
        createdAt: agoDays(10),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "in_review",
        actorLabel: "naledi.khumalo@statssa.gov.za",
        createdAt: agoDays(10),
      },
      {
        kind: "status_changed",
        fromStatus: "in_review",
        toStatus: "awaiting_information",
        visibility: "requester",
        actorLabel: "naledi.khumalo@statssa.gov.za",
        message:
          "Please confirm the survey reference so we can locate the record. Reply to this message to continue.",
        createdAt: agoDays(2),
      },
    ],
  },
  {
    reference: "POPIA-2026-SEED04",
    type: "objection",
    status: "acknowledged",
    requesterName: "Grace Nkosi",
    requesterEmail: "grace.nkosi@example.co.za",
    details:
      "I object to my personal information being used for any purpose beyond the survey I participated in.",
    desiredOutcome: "Restrict processing to the original survey purpose.",
    assignedTo: STAFF,
    dueAt: inDays(25),
    createdAt: agoDays(3),
    updatedAt: agoDays(2),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Grace Nkosi",
        message: "Request received.",
        createdAt: agoDays(3),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "acknowledged",
        actorLabel: "staff@statssa.gov.za",
        message: "Acknowledged. We will respond within 30 days.",
        createdAt: agoDays(2),
      },
    ],
  },
  {
    reference: "POPIA-2026-SEED05",
    type: "access",
    status: "completed",
    requesterName: "Peter van Wyk",
    requesterEmail: "peter.vanwyk@example.co.za",
    details:
      "Please provide a copy of the personal information you hold from my participation in the 2021 General Household Survey.",
    desiredOutcome: "A copy of the requested records.",
    resolution:
      "The requested records were compiled and released to the requester. A covering letter explains each data field and the retention period.",
    assignedTo: STAFF,
    dueAt: inDays(5),
    createdAt: agoDays(28),
    updatedAt: agoDays(1),
    closedAt: agoDays(1),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Peter van Wyk",
        message: "Request received.",
        createdAt: agoDays(28),
      },
      {
        kind: "assigned",
        actorLabel: "staff@statssa.gov.za",
        message: "Assigned to staff@statssa.gov.za.",
        createdAt: agoDays(27),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "in_review",
        actorLabel: "staff@statssa.gov.za",
        createdAt: agoDays(27),
      },
      {
        kind: "resolution",
        visibility: "requester",
        actorLabel: "staff@statssa.gov.za",
        message: "Records released to the requester.",
        createdAt: agoDays(1),
      },
      {
        kind: "status_changed",
        fromStatus: "in_review",
        toStatus: "completed",
        visibility: "requester",
        actorLabel: "staff@statssa.gov.za",
        message: "Request completed.",
        createdAt: agoDays(1),
      },
    ],
  },
  {
    reference: "POPIA-2026-SEED06",
    type: "correction",
    status: "rejected",
    requesterName: "Fatima Cassim",
    requesterEmail: "fatima.cassim@example.co.za",
    details:
      "Please change the income band on my household record. I believe it was captured in the wrong bracket.",
    desiredOutcome: "Update the income band on my record.",
    resolution:
      "The correction could not be made because the record identified does not belong to the requester. No personal information was disclosed or changed.",
    assignedTo: NALEDI,
    dueAt: inDays(12),
    createdAt: agoDays(20),
    updatedAt: agoDays(5),
    closedAt: agoDays(5),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Fatima Cassim",
        message: "Request received.",
        createdAt: agoDays(20),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "in_review",
        actorLabel: "naledi.khumalo@statssa.gov.za",
        createdAt: agoDays(18),
      },
      {
        kind: "note",
        actorLabel: "naledi.khumalo@statssa.gov.za",
        message: "The reference supplied matches a different household.",
        createdAt: agoDays(7),
      },
      {
        kind: "status_changed",
        fromStatus: "in_review",
        toStatus: "rejected",
        visibility: "requester",
        actorLabel: "naledi.khumalo@statssa.gov.za",
        message: "We could not action this request. See the resolution for details.",
        createdAt: agoDays(5),
      },
    ],
  },
  {
    reference: "POPIA-2026-SEED07",
    type: "deletion",
    status: "withdrawn",
    requesterName: "Thabo Molefe",
    requesterEmail: "thabo.molefe@example.co.za",
    details:
      "Please delete the email address I supplied when requesting access to my data last year.",
    desiredOutcome: "Delete the stored email address.",
    dueAt: inDays(22),
    createdAt: agoDays(4),
    updatedAt: agoDays(3),
    closedAt: agoDays(3),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Thabo Molefe",
        message: "Request received.",
        createdAt: agoDays(4),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "withdrawn",
        visibility: "requester",
        actorLabel: "Thabo Molefe",
        message: "Withdrawn at the requester's request.",
        createdAt: agoDays(3),
      },
    ],
  },
];

const GHS_STAT_RELEASE_SOURCE: MediaDraftSource = {
  chunkId: 1,
  table: null,
  source: "ghs-2025-statistical-release.md",
  title: "General Household Survey 2025 — P0318",
  snippet:
    "Access to the internet through a fixed connection increased steadily to 20,6% in 2025, while mobile broadband reached 85,6% of households.",
};

const GHS_MEDIA_SOURCE: MediaDraftSource = {
  chunkId: 1,
  table: null,
  source: "ghs-2025-media-release.md",
  title: "General Household Survey (GHS), 2025 — media release",
  snippet:
    "Access to improved sanitation increased from 61,7% in 2002 to 84,0% in 2025, while electricity access rose from 76,7% to 90,6%.",
};

const INTERNET_TABLE_SOURCE: MediaDraftSource = {
  chunkId: null,
  table: "internet_access_by_province",
  source: "factstore:internet_access_by_province",
  title: null,
  snippet: "Published table: factstore.internet_access_by_province (2025).",
};

const ASSETS_TABLE_SOURCE: MediaDraftSource = {
  chunkId: null,
  table: "household_assets",
  source: "factstore:household_assets",
  title: null,
  snippet: "Published table: factstore.household_assets (2025).",
};

interface MediaEventSeed {
  kind:
    | "submitted"
    | "status_changed"
    | "assigned"
    | "note"
    | "draft_generated"
    | "approved"
    | "rejected";
  visibility?: "requester" | "internal";
  fromStatus?: MediaRequestStatus | null;
  toStatus?: MediaRequestStatus | null;
  actorId?: string | null;
  actorLabel: string;
  message?: string | null;
  createdAt: Date;
}

interface MediaSeed {
  reference: string;
  status: MediaRequestStatus;
  requesterName: string;
  requesterEmail: string;
  requesterId?: string | null;
  outlet?: string | null;
  claim: string;
  context?: string | null;
  aiDraft?: string | null;
  aiSources?: MediaDraftSource[] | null;
  aiGap?: string | null;
  aiModel?: string | null;
  aiGeneratedAt?: Date | null;
  approvedResponse?: string | null;
  approvedSources?: MediaDraftSource[] | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  rejectedReason?: string | null;
  assignedTo?: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null;
  events: MediaEventSeed[];
}

const MEDIA_SEEDS: MediaSeed[] = [
  {
    reference: "MEDIA-2026-SEED01",
    status: "submitted",
    requesterName: "Sipho Dlamini",
    requesterEmail: "press@example.co.za",
    requesterId: PRESS,
    outlet: "The Daily Line",
    claim: "Is it true that access to improved sanitation rose to 84,0% in 2025?",
    context: "A minister cited this figure in a speech this morning.",
    createdAt: agoHours(2),
    updatedAt: agoHours(2),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Sipho Dlamini",
        message: "Request received.",
        createdAt: agoHours(2),
      },
    ],
  },
  {
    reference: "MEDIA-2026-SEED02",
    status: "analysing",
    requesterName: "Amara Naidoo",
    requesterEmail: "amara.naidoo@example.co.za",
    requesterId: AMARA,
    outlet: "News24",
    claim: "What share of households had access to any kind of internet in 2025?",
    assignedTo: STAFF,
    createdAt: agoHours(5),
    updatedAt: agoHours(1),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Amara Naidoo",
        message: "Request received.",
        createdAt: agoHours(5),
      },
      {
        kind: "assigned",
        actorLabel: "staff@statssa.gov.za",
        message: "Assigned to staff@statssa.gov.za.",
        createdAt: agoHours(4),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "analysing",
        actorLabel: "staff@statssa.gov.za",
        message: "Searching approved sources.",
        createdAt: agoHours(1),
      },
    ],
  },
  {
    reference: "MEDIA-2026-SEED03",
    status: "awaiting_review",
    requesterName: "Sipho Dlamini",
    requesterEmail: "press@example.co.za",
    requesterId: PRESS,
    outlet: "SABC News",
    claim: "How does household access to the internet compare across provinces in 2025?",
    assignedTo: STAFF,
    aiDraft:
      "Nationally, 85,6% of households had at least one member with access to the internet in 2025 [ghs-2025-statistical-release.md#1]. Access was highest in the Western Cape (93,8%), Gauteng (88,5%) and KwaZulu-Natal (87,3%), and lowest in the Eastern Cape (74,5%) [factstore:internet_access_by_province].\n\nMobile access (78,9%) was far more common than a fixed connection at home (20,6%) [factstore:internet_access_by_province].",
    aiSources: [GHS_STAT_RELEASE_SOURCE, GHS_MEDIA_SOURCE, INTERNET_TABLE_SOURCE],
    aiModel: "seed-demo-model",
    aiGeneratedAt: agoHours(9),
    createdAt: agoDays(1),
    updatedAt: agoHours(8),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Sipho Dlamini",
        message: "Request received.",
        createdAt: agoDays(1),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "analysing",
        actorLabel: "staff@statssa.gov.za",
        createdAt: agoHours(10),
      },
      {
        kind: "draft_generated",
        actorLabel: "Rafiki",
        message: "Draft prepared from approved Stats SA sources; awaiting review.",
        createdAt: agoHours(9),
      },
      {
        kind: "assigned",
        actorLabel: "staff@statssa.gov.za",
        message: "Assigned to staff@statssa.gov.za.",
        createdAt: agoHours(8),
      },
    ],
  },
  {
    reference: "MEDIA-2026-SEED04",
    status: "information_gap",
    requesterName: "Ahmed Patel",
    requesterEmail: "ahmed.patel@example.co.za",
    outlet: "Mail & Guardian",
    claim: "What is the projected population of a new district in 2035?",
    assignedTo: NALEDI,
    aiGap:
      "Approved Stats SA sources do not contain a 2035 district population projection, so no response was drafted.",
    createdAt: agoDays(2),
    updatedAt: agoHours(20),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Ahmed Patel",
        message: "Request received.",
        createdAt: agoDays(2),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "analysing",
        actorLabel: "naledi.khumalo@statssa.gov.za",
        createdAt: agoDays(1),
      },
      {
        kind: "status_changed",
        fromStatus: "analysing",
        toStatus: "information_gap",
        visibility: "requester",
        actorLabel: "naledi.khumalo@statssa.gov.za",
        message: "Approved sources do not cover this query. An official will follow up.",
        createdAt: agoHours(20),
      },
    ],
  },
  {
    reference: "MEDIA-2026-SEED05",
    status: "approved",
    requesterName: "Grace Nkosi",
    requesterEmail: "grace.nkosi@example.co.za",
    requesterId: GRACE,
    outlet: "Business Day",
    claim:
      "How common is ownership of electric stoves and refrigerators in South African households?",
    assignedTo: STAFF,
    aiDraft:
      "Household asset ownership remained high in 2025, with electric stoves owned by 88,3% of households and refrigerators by 81,5% [factstore:household_assets].",
    aiSources: [ASSETS_TABLE_SOURCE],
    aiModel: "seed-demo-model",
    aiGeneratedAt: agoDays(3),
    approvedResponse:
      "Household asset ownership remained high in 2025, with electric stoves owned by 88,3% of households and refrigerators by 81,5% [factstore:household_assets]. Ownership was similar across urban and metro households.",
    approvedSources: [ASSETS_TABLE_SOURCE],
    approvedAt: agoDays(1),
    approvedBy: ADMIN,
    createdAt: agoDays(4),
    updatedAt: agoDays(1),
    closedAt: agoDays(1),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Grace Nkosi",
        message: "Request received.",
        createdAt: agoDays(4),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "analysing",
        actorLabel: "staff@statssa.gov.za",
        createdAt: agoDays(3),
      },
      {
        kind: "draft_generated",
        actorLabel: "Rafiki",
        message: "Draft prepared from approved Stats SA sources.",
        createdAt: agoDays(3),
      },
      {
        kind: "approved",
        visibility: "requester",
        actorLabel: "admin@statssa.gov.za",
        message: "Response reviewed and approved. It is now available to the requester.",
        createdAt: agoDays(1),
      },
    ],
  },
  {
    reference: "MEDIA-2026-SEED06",
    status: "rejected",
    requesterName: "Peter van Wyk",
    requesterEmail: "peter.vanwyk@example.co.za",
    outlet: "The Citizen",
    claim: "Please confirm the market share of a private retailer in the food sector.",
    assignedTo: STAFF,
    rejectedReason:
      "Stats SA does not publish company-level market share data. The request falls outside our published statistics.",
    createdAt: agoDays(9),
    updatedAt: agoDays(6),
    closedAt: agoDays(6),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Peter van Wyk",
        message: "Request received.",
        createdAt: agoDays(9),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "analysing",
        actorLabel: "staff@statssa.gov.za",
        createdAt: agoDays(8),
      },
      {
        kind: "rejected",
        visibility: "requester",
        actorLabel: "staff@statssa.gov.za",
        message: "Stats SA has declined to respond to this request. See the reason provided.",
        createdAt: agoDays(6),
      },
    ],
  },
  {
    reference: "MEDIA-2026-SEED07",
    status: "withdrawn",
    requesterName: "Fatima Cassim",
    requesterEmail: "fatima.cassim@example.co.za",
    outlet: "Daily Maverick",
    claim: "What is the unemployment rate for the first quarter of 2026?",
    createdAt: agoDays(1),
    updatedAt: agoHours(6),
    closedAt: agoHours(6),
    events: [
      {
        kind: "submitted",
        visibility: "requester",
        actorLabel: "Fatima Cassim",
        message: "Request received.",
        createdAt: agoDays(1),
      },
      {
        kind: "status_changed",
        fromStatus: "submitted",
        toStatus: "withdrawn",
        visibility: "requester",
        actorLabel: "Fatima Cassim",
        message: "Withdrawn by the requester.",
        createdAt: agoHours(6),
      },
    ],
  },
];

async function seed(): Promise<void> {
  const database = new URL(connectionString).pathname.slice(1);
  console.log(`Seeding ${database}…`);

  await db.transaction(async (tx) => {
    // Seeded rows are marked by reference, so re-runs replace them without touching real data.
    await tx.delete(popiaRequests).where(like(popiaRequests.reference, SEED_MARKER_POPIA));
    await tx.delete(mediaRequests).where(like(mediaRequests.reference, SEED_MARKER_MEDIA));

    for (const user of SEED_USERS) {
      await tx
        .insert(users)
        .values({ id: userId(user.email), email: user.email.trim().toLowerCase(), role: user.role })
        .onConflictDoUpdate({
          target: users.email,
          set: { role: user.role, updatedAt: new Date() },
        });
    }

    for (const seed of POPIA_SEEDS) {
      const requestId = randomUUID();
      await tx.insert(popiaRequests).values({
        id: requestId,
        reference: seed.reference,
        type: seed.type,
        status: seed.status,
        requesterName: seed.requesterName,
        requesterEmail: seed.requesterEmail,
        requesterPhone: seed.requesterPhone ?? null,
        requesterId: seed.requesterId ?? null,
        details: seed.details,
        desiredOutcome: seed.desiredOutcome ?? null,
        resolution: seed.resolution ?? null,
        assignedTo: seed.assignedTo ?? null,
        dueAt: seed.dueAt,
        createdAt: seed.createdAt,
        updatedAt: seed.updatedAt,
        closedAt: seed.closedAt ?? null,
      });

      if (seed.events.length > 0) {
        await tx.insert(popiaRequestEvents).values(
          seed.events.map((event) => ({
            id: randomUUID(),
            requestId,
            kind: event.kind,
            visibility: event.visibility ?? "internal",
            fromStatus: event.fromStatus ?? null,
            toStatus: event.toStatus ?? null,
            actorId: event.actorId ?? null,
            actorLabel: event.actorLabel,
            message: event.message ?? null,
            createdAt: event.createdAt,
          })),
        );
      }
    }

    for (const seed of MEDIA_SEEDS) {
      const requestId = randomUUID();
      await tx.insert(mediaRequests).values({
        id: requestId,
        reference: seed.reference,
        status: seed.status,
        requesterName: seed.requesterName,
        requesterEmail: seed.requesterEmail,
        requesterId: seed.requesterId ?? null,
        outlet: seed.outlet ?? null,
        claim: seed.claim,
        context: seed.context ?? null,
        aiDraft: seed.aiDraft ?? null,
        aiSources: seed.aiSources ?? null,
        aiGap: seed.aiGap ?? null,
        aiModel: seed.aiModel ?? null,
        aiGeneratedAt: seed.aiGeneratedAt ?? null,
        approvedResponse: seed.approvedResponse ?? null,
        approvedSources: seed.approvedSources ?? null,
        approvedAt: seed.approvedAt ?? null,
        approvedBy: seed.approvedBy ?? null,
        rejectedReason: seed.rejectedReason ?? null,
        assignedTo: seed.assignedTo ?? null,
        createdAt: seed.createdAt,
        updatedAt: seed.updatedAt,
        closedAt: seed.closedAt ?? null,
      });

      if (seed.events.length > 0) {
        await tx.insert(mediaRequestEvents).values(
          seed.events.map((event) => ({
            id: randomUUID(),
            requestId,
            kind: event.kind,
            visibility: event.visibility ?? "internal",
            fromStatus: event.fromStatus ?? null,
            toStatus: event.toStatus ?? null,
            actorId: event.actorId ?? null,
            actorLabel: event.actorLabel,
            message: event.message ?? null,
            createdAt: event.createdAt,
          })),
        );
      }
    }
  });

  console.log(
    `Done. ${SEED_USERS.length} users, ${POPIA_SEEDS.length} POPIA requests, ` +
      `${MEDIA_SEEDS.length} media requests.`,
  );
  console.log(
    "Passwords are not seeded. Register through the UI with a seeded email to sign in; the role is already set.",
  );
}

try {
  await seed();
} finally {
  await client.end();
}
