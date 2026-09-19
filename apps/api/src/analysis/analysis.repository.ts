import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type {
  AnalysisBriefContent,
  AnalysisBriefSource,
  BriefVerificationStatus,
} from "@voltedge/brief-contract";
import postgres, { type Sql } from "postgres";
import { orDefault } from "../env.ts";

const DEFAULT_DATABASE_URL = "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth";

/** The contract types are structurally JSON; postgres.js only asks for the type. */
function toJson(value: unknown): postgres.JSONValue {
  return value as postgres.JSONValue;
}

export interface AnalysisBriefRecord {
  id: string;
  title: string;
  sources: string[];
  focus: string | null;
  content: AnalysisBriefContent | null;
  references: AnalysisBriefSource[];
  verificationStatus: BriefVerificationStatus;
  unverifiedNumbers: string[];
  aiModel: string | null;
  createdBy: string | null;
  createdByLabel: string;
  createdAt: Date;
}

export interface NewAnalysisBrief {
  id: string;
  title: string;
  sources: string[];
  focus: string | null;
  content: AnalysisBriefContent;
  references: AnalysisBriefSource[];
  verificationStatus: BriefVerificationStatus;
  unverifiedNumbers: string[];
  aiModel: string | null;
  createdBy: string | null;
  createdByLabel: string;
}

export interface BriefPage {
  briefs: AnalysisBriefRecord[];
  total: number;
}

export interface UserIdentity {
  id: string;
  email: string;
}

/**
 * SQL over `analysis_briefs` in `rafiki_auth`, alongside the POPIA and media
 * tables so the same database backs every desk.
 */
@Injectable()
export class AnalysisRepository implements OnModuleDestroy {
  private client: Sql | undefined;

  private get sql(): Sql {
    this.client ??= postgres(orDefault("DATABASE_URL", DEFAULT_DATABASE_URL), {
      max: 4,
      onnotice: () => undefined,
    });
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.end();
  }

  async findUserById(id: string): Promise<UserIdentity | undefined> {
    const [row] = await this.sql<UserIdentity[]>`
      SELECT id, email FROM users WHERE id = ${id}
    `;
    return row;
  }

  async insert(brief: NewAnalysisBrief): Promise<AnalysisBriefRecord> {
    const [row] = await this.sql<AnalysisBriefRecord[]>`
      INSERT INTO analysis_briefs (
        id, title, sources, focus, content, "references",
        verification_status, unverified_numbers, ai_model, created_by, created_by_label
      )
      VALUES (
        ${brief.id},
        ${brief.title},
        ${this.sql.json(toJson(brief.sources))},
        ${brief.focus},
        ${this.sql.json(toJson(brief.content))},
        ${this.sql.json(toJson(brief.references))},
        ${brief.verificationStatus},
        ${this.sql.json(toJson(brief.unverifiedNumbers))},
        ${brief.aiModel},
        ${brief.createdBy},
        ${brief.createdByLabel}
      )
      RETURNING id, title, sources, focus, content, "references",
                verification_status AS "verificationStatus",
                unverified_numbers AS "unverifiedNumbers",
                ai_model AS "aiModel",
                created_by AS "createdBy",
                created_by_label AS "createdByLabel",
                created_at AS "createdAt"
    `;
    if (!row) throw new Error("insert returned no analysis brief");
    return row;
  }

  async get(id: string): Promise<AnalysisBriefRecord | undefined> {
    const [row] = await this.sql<AnalysisBriefRecord[]>`
      SELECT id, title, sources, focus, content, "references",
             verification_status AS "verificationStatus",
             unverified_numbers AS "unverifiedNumbers",
             ai_model AS "aiModel",
             created_by AS "createdBy",
             created_by_label AS "createdByLabel",
             created_at AS "createdAt"
      FROM analysis_briefs
      WHERE id = ${id}
    `;
    return row;
  }

  async list(input: { q?: string; limit: number; offset: number }): Promise<BriefPage> {
    const filter = input.q
      ? this.sql`WHERE (title ILIKE ${`%${input.q}%`} OR created_by_label ILIKE ${`%${input.q}%`})`
      : this.sql``;
    const rows = await this.sql<(AnalysisBriefRecord & { total: number })[]>`
      SELECT id, title, sources, focus, content, "references",
             verification_status AS "verificationStatus",
             unverified_numbers AS "unverifiedNumbers",
             ai_model AS "aiModel",
             created_by AS "createdBy",
             created_by_label AS "createdByLabel",
             created_at AS "createdAt",
             COUNT(*) OVER()::int AS total
      FROM analysis_briefs
      ${filter}
      ORDER BY created_at DESC
      LIMIT ${input.limit} OFFSET ${input.offset}
    `;
    return {
      briefs: rows.map(({ total: _total, ...brief }) => brief),
      total: rows[0]?.total ?? 0,
    };
  }
}
