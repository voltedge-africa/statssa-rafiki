import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import {
  toBriefSummary,
  type AnalysisBrief,
  type AnalysisBriefContent,
  type AnalysisBriefListResponse,
  type CreateAnalysisBriefInput,
  type IndexedDocumentListResponse,
  type IndexedDocumentSummary,
} from "@voltedge/brief-contract";
import { GovernanceService } from "../admin/governance.service.ts";
import { listIndexedDocuments } from "../agent/rag/document.ts";
import { AnalysisDraftService } from "./analysis-draft.service.ts";
import { AnalysisRepository, type AnalysisBriefRecord } from "./analysis.repository.ts";

const EMPTY_CONTENT: AnalysisBriefContent = {
  summary: "",
  keyFindings: [],
  statistics: [],
  trends: [],
  insights: [],
  context: [],
};

export interface AnalysisBriefQuery {
  q?: string;
  limit: number;
  offset: number;
}

/** A readable title from the document scope when the operator did not supply one. */
export function defaultTitle(sources: string[], documents: IndexedDocumentSummary[]): string {
  const titles = sources.map(
    (source) => documents.find((document) => document.source === source)?.title ?? source,
  );
  const [first, ...rest] = titles;
  if (!first) return "Content analysis";
  return rest.length === 0 ? `Analysis: ${first}` : `Analysis: ${first} +${rest.length} more`;
}

function toBrief(record: AnalysisBriefRecord): AnalysisBrief {
  return {
    id: record.id,
    title: record.title,
    sources: record.sources,
    focus: record.focus,
    content: record.content ?? EMPTY_CONTENT,
    references: record.references,
    verification: {
      status: record.verificationStatus,
      unverified: record.unverifiedNumbers,
    },
    model: record.aiModel,
    createdByLabel: record.createdByLabel,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Content-analysis briefs: the document picker, generation and the saved-brief
 * history. Generation runs synchronously — the operator waits a few seconds for
 * a complete, cited brief — and only a grounded, structured result is persisted.
 */
@Injectable()
export class AnalysisService {
  constructor(
    private readonly repo: AnalysisRepository,
    private readonly drafts: AnalysisDraftService,
    private readonly governance: GovernanceService,
  ) {}

  async documents(): Promise<IndexedDocumentListResponse> {
    return { documents: await listIndexedDocuments() };
  }

  async create(input: CreateAnalysisBriefInput, user: AuthUser): Promise<AnalysisBrief> {
    const settings = await this.governance.settings();
    if (!settings.generationEnabled) {
      throw new ServiceUnavailableException(
        "AI generation is disabled by an administrator. Analysis briefs are unavailable.",
      );
    }

    const indexed = await listIndexedDocuments();
    const known = new Set(indexed.map((document) => document.source));
    const missing = input.sources.filter((source) => !known.has(source));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Not in the indexed corpus: ${missing.join(", ")}. Re-index the corpus and try again.`,
      );
    }

    const focus = input.focus?.trim() ? input.focus.trim() : null;
    const result = await this.drafts.generate({
      sources: input.sources,
      focus,
      confidenceMin: settings.confidenceMin,
    });

    if (!result.content) {
      throw new UnprocessableEntityException(
        result.gap ?? "The brief could not be generated from the selected documents.",
      );
    }

    const identity = await this.repo.findUserById(user.id);
    const record = await this.repo.insert({
      id: randomUUID(),
      title: input.title?.trim() || defaultTitle(input.sources, indexed),
      sources: input.sources,
      focus,
      content: result.content,
      references: result.references,
      verificationStatus: result.verification.status,
      unverifiedNumbers: result.verification.unverified,
      aiModel: result.model,
      createdBy: user.id,
      createdByLabel: identity?.email ?? `Stats SA ${user.role}`,
    });

    return toBrief(record);
  }

  async list(query: AnalysisBriefQuery): Promise<AnalysisBriefListResponse> {
    const page = await this.repo.list(query);
    return {
      briefs: page.briefs.map((record) => toBriefSummary(toBrief(record))),
      total: page.total,
    };
  }

  async get(id: string): Promise<AnalysisBrief> {
    const record = await this.repo.get(id);
    if (!record) throw new NotFoundException(`No analysis brief with id "${id}".`);
    return toBrief(record);
  }
}
