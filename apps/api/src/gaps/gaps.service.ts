import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import {
  GAP_SURFACES,
  labelFromQuery,
  share,
  type GapCategory,
  type GapCategoryCount,
  type GapCategoryListResponse,
  type GapQuery,
  type GapQueryListResponse,
  type GapSummary,
  type GapSurface,
} from "@voltedge/gaps-contract";
import { embedQuery } from "../agent/rag/embed.ts";
import { CATEGORY_SIMILARITY_MIN, MAX_GAP_QUERY_CHARS } from "./config.ts";
import { GapsRepository, type GapQueryRecord } from "./gaps.repository.ts";

const DAY_MS = 86_400_000;

export interface RecordGapInput {
  surface: GapSurface;
  query: string;
  reference?: string | null;
  outlet?: string | null;
  role?: string | null;
  origin?: string | null;
  reason?: string | null;
}

export interface GapCategoryQuery {
  q?: string;
  limit: number;
  offset: number;
}

/** The half-open window `[from, to)` and a zero-filled date for every day in it. */
export function windowFor(days: number, now: Date): { from: Date; to: Date; dates: string[] } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const from = new Date(to.getTime() - days * DAY_MS);
  const dates: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    dates.push(new Date(from.getTime() + offset * DAY_MS).toISOString().slice(0, 10));
  }
  return { from, to, dates };
}

function normaliseQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_GAP_QUERY_CHARS);
}

/** pgvector's text form (`[0.1,0.2,...]`) as numbers. */
export function parseVector(value: string): number[] {
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((part) => Number(part));
}

/**
 * The category centroid after one more member: `(previous * count + incoming) / (count + 1)`.
 * pgvector has no scalar arithmetic, so this runs here and the result is stored whole.
 */
export function runningMean(
  previous: number[],
  count: number,
  incoming: Float32Array,
): Float32Array {
  const next = new Float32Array(incoming.length);
  for (let index = 0; index < incoming.length; index += 1) {
    next[index] = ((previous[index] ?? 0) * count + incoming[index]!) / (count + 1);
  }
  return next;
}

function toCategory(record: {
  id: string;
  label: string;
  description: string | null;
  queryCount: number;
  firstSeen: Date;
  lastSeen: Date;
  surfaces: GapSurface[];
}): GapCategory {
  return {
    id: record.id,
    label: record.label,
    description: record.description,
    queryCount: record.queryCount,
    firstSeen: record.firstSeen.toISOString(),
    lastSeen: record.lastSeen.toISOString(),
    surfaces: record.surfaces,
  };
}

function toGapQuery(record: GapQueryRecord): GapQuery {
  return {
    id: record.id,
    categoryId: record.categoryId,
    surface: record.surface,
    query: record.query,
    reference: record.reference,
    outlet: record.outlet,
    role: record.role,
    origin: record.origin,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * The knowledge-gap log: every query the approved sources could not answer.
 *
 * Recording is deliberately failure-tolerant. The query row is the point of the
 * log, so if the embedding model is cold or unavailable the query is still
 * stored (uncategorised) rather than dropped; the next sweep can cluster it.
 */
@Injectable()
export class GapsService {
  private readonly logger = new Logger(GapsService.name);

  constructor(private readonly repo: GapsRepository) {}

  async record(input: RecordGapInput): Promise<void> {
    const query = normaliseQuery(input.query);
    if (!query) return;

    let categoryId: string | null = null;
    try {
      const embedding = await embedQuery(query);
      const nearest = await this.repo.nearestCategory(embedding);
      if (nearest && nearest.similarity >= CATEGORY_SIMILARITY_MIN) {
        categoryId = nearest.id;
        await this.repo.addQueryToCategory(
          nearest.id,
          runningMean(parseVector(nearest.centroid), nearest.queryCount, embedding),
        );
      } else {
        categoryId = randomUUID();
        await this.repo.createCategory({
          id: categoryId,
          label: labelFromQuery(query),
          centroid: embedding,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Gap categorisation failed, recording uncategorised: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await this.repo.insertQuery({
      id: randomUUID(),
      categoryId,
      surface: input.surface,
      query,
      reference: input.reference ?? null,
      outlet: input.outlet ?? null,
      role: input.role ?? null,
      origin: input.origin ?? null,
      reason: input.reason ?? null,
    });
  }

  async summary(days: number, now: Date = new Date()): Promise<GapSummary> {
    const { from, to, dates } = windowFor(days, now);
    const aggregates = await this.repo.summary(from, to);

    const byDate = new Map(aggregates.daily.map((row) => [row.date, row.count]));
    const surfaces = GAP_SURFACES.map((surface) => ({
      surface,
      count: aggregates.surfaces.find((row) => row.surface === surface)?.count ?? 0,
    }));

    const topCategories: GapCategoryCount[] = aggregates.topCategories.map((row) => ({
      id: row.id,
      label: row.label,
      queryCount: row.queryCount,
      share: share(row.queryCount, aggregates.total),
      lastSeen: row.lastSeen.toISOString(),
    }));

    return {
      generatedAt: now.toISOString(),
      days,
      from: from.toISOString(),
      to: to.toISOString(),
      total: aggregates.total,
      categories: aggregates.categories,
      newCategories: aggregates.newCategories,
      daily: dates.map((date) => ({ date, count: byDate.get(date) ?? 0 })),
      surfaces,
      topCategories,
      topOutlets: aggregates.topOutlets,
    };
  }

  async listCategories(query: GapCategoryQuery): Promise<GapCategoryListResponse> {
    const page = await this.repo.listCategories(query);
    return { categories: page.categories.map(toCategory), total: page.total };
  }

  async listQueries(
    categoryId: string,
    limit: number,
    offset: number,
  ): Promise<GapQueryListResponse> {
    const page = await this.repo.listQueries(categoryId, limit, offset);
    return { queries: page.queries.map(toGapQuery), total: page.total };
  }

  pendingCategories(limit: number): Promise<{ id: string; label: string }[]> {
    return this.repo.pendingCategories(limit);
  }

  applyLabel(id: string, label: string): Promise<void> {
    return this.repo.setCategoryLabel(id, label);
  }
}
