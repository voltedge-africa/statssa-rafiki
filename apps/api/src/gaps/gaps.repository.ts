import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { GapLabelSource, GapSurface } from "@voltedge/gaps-contract";
import postgres, { type Sql } from "postgres";
import { orDefault } from "../env.ts";

const DEFAULT_DATABASE_URL = "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth";

/** pgvector accepts a bracketed string literal, e.g. `[0.1,0.2,...]`. */
function vectorLiteral(values: Float32Array | number[]): string {
  return `[${Array.from(values).join(",")}]`;
}

export interface NewGapQuery {
  id: string;
  categoryId: string | null;
  surface: GapSurface;
  query: string;
  reference: string | null;
  outlet: string | null;
  role: string | null;
  origin: string | null;
  reason: string | null;
}

export interface GapQueryRecord extends NewGapQuery {
  createdAt: Date;
}

export interface GapCategoryRecord {
  id: string;
  label: string;
  description: string | null;
  labelSource: GapLabelSource;
  queryCount: number;
  firstSeen: Date;
  lastSeen: Date;
  surfaces: GapSurface[];
}

export interface NearestCategory {
  id: string;
  label: string;
  queryCount: number;
  /** The category centroid as pgvector's text form, e.g. `[0.1,0.2,...]`. */
  centroid: string;
  similarity: number;
}

export interface NewGapCategory {
  id: string;
  label: string;
  centroid: Float32Array;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface CategoryCount {
  id: string;
  label: string;
  queryCount: number;
  lastSeen: Date;
}

export interface SurfaceCount {
  surface: GapSurface;
  count: number;
}

export interface OutletCount {
  outlet: string;
  count: number;
}

export interface GapAggregates {
  total: number;
  categories: number;
  newCategories: number;
  daily: DayCount[];
  surfaces: SurfaceCount[];
  topCategories: CategoryCount[];
  topOutlets: OutletCount[];
}

/**
 * Read/write SQL over the knowledge-gap tables in `rafiki_auth`. The centroid
 * math runs in Postgres (`addQueryToCategory`), so concurrent writers cannot
 * clobber each other's running mean.
 */
@Injectable()
export class GapsRepository implements OnModuleDestroy {
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

  async insertQuery(row: NewGapQuery): Promise<void> {
    await this.sql`
      INSERT INTO gap_queries (
        id, category_id, surface, query, reference, outlet, role, origin, reason
      )
      VALUES (
        ${row.id}, ${row.categoryId}, ${row.surface}, ${row.query},
        ${row.reference}, ${row.outlet}, ${row.role}, ${row.origin}, ${row.reason}
      )
    `;
  }

  async nearestCategory(embedding: Float32Array): Promise<NearestCategory | null> {
    const [row] = await this.sql<NearestCategory[]>`
      SELECT id, label, query_count AS "queryCount", centroid::text AS centroid,
             1 - (centroid <=> ${vectorLiteral(embedding)}::vector) AS similarity
      FROM gap_categories
      WHERE centroid IS NOT NULL
      ORDER BY centroid <=> ${vectorLiteral(embedding)}::vector
      LIMIT 1
    `;
    return row ?? null;
  }

  async createCategory(category: NewGapCategory): Promise<void> {
    await this.sql`
      INSERT INTO gap_categories (id, label, centroid)
      VALUES (${category.id}, ${category.label}, ${vectorLiteral(category.centroid)}::vector)
    `;
  }

  /**
   * Replace a category's centroid with the caller-computed running mean. The
   * mean is computed in the service because pgvector has no scalar arithmetic;
   * the count bump and timestamp stay atomic with the write.
   */
  async addQueryToCategory(id: string, centroid: Float32Array): Promise<void> {
    await this.sql`
      UPDATE gap_categories
      SET centroid = ${vectorLiteral(centroid)}::vector,
          query_count = query_count + 1,
          last_seen = now()
      WHERE id = ${id}
    `;
  }

  async pendingCategories(limit: number): Promise<{ id: string; label: string }[]> {
    return this.sql<{ id: string; label: string }[]>`
      SELECT id, label
      FROM gap_categories
      WHERE label_source = 'auto'
      ORDER BY first_seen
      LIMIT ${limit}
    `;
  }

  async setCategoryLabel(id: string, label: string): Promise<void> {
    await this.sql`
      UPDATE gap_categories
      SET label = ${label}, label_source = 'model'
      WHERE id = ${id}
    `;
  }

  async listCategories(input: {
    q?: string;
    limit: number;
    offset: number;
  }): Promise<{ categories: GapCategoryRecord[]; total: number }> {
    const filter = input.q ? this.sql`WHERE c.label ILIKE ${`%${input.q}%`}` : this.sql``;
    const rows = await this.sql<(GapCategoryRecord & { total: number })[]>`
      SELECT c.id, c.label, c.description,
             c.label_source AS "labelSource",
             c.query_count AS "queryCount",
             c.first_seen AS "firstSeen",
             c.last_seen AS "lastSeen",
             COALESCE(
               array_agg(DISTINCT q.surface) FILTER (WHERE q.surface IS NOT NULL),
               '{}'
             )::text[] AS surfaces,
             COUNT(*) OVER()::int AS total
      FROM gap_categories c
      LEFT JOIN gap_queries q ON q.category_id = c.id
      ${filter}
      GROUP BY c.id
      ORDER BY c.query_count DESC, c.last_seen DESC
      LIMIT ${input.limit} OFFSET ${input.offset}
    `;
    return {
      categories: rows.map(({ total: _total, ...category }) => ({
        ...category,
        surfaces: category.surfaces ?? [],
      })),
      total: rows[0]?.total ?? 0,
    };
  }

  async listQueries(
    categoryId: string,
    limit: number,
    offset: number,
  ): Promise<{ queries: GapQueryRecord[]; total: number }> {
    const rows = await this.sql<(GapQueryRecord & { total: number })[]>`
      SELECT q.id, q.category_id AS "categoryId", q.surface, q.query,
             q.reference, q.outlet, q.role, q.origin, q.reason,
             q.created_at AS "createdAt",
             COUNT(*) OVER()::int AS total
      FROM gap_queries q
      WHERE q.category_id = ${categoryId}
      ORDER BY q.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return {
      queries: rows.map(({ total: _total, ...query }) => query),
      total: rows[0]?.total ?? 0,
    };
  }

  async summary(from: Date, to: Date): Promise<GapAggregates> {
    const [[totals], [created], [allCategories], daily, surfaces, topCategories, topOutlets] =
      await Promise.all([
        this.sql<{ total: number; categories: number }[]>`
          SELECT COUNT(*)::int AS total,
                 COUNT(DISTINCT category_id)::int AS categories
          FROM gap_queries
          WHERE created_at >= ${from} AND created_at < ${to}
        `,
        this.sql<{ count: number }[]>`
          SELECT COUNT(*)::int AS count
          FROM gap_categories
          WHERE first_seen >= ${from} AND first_seen < ${to}
        `,
        this.sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM gap_categories`,
        this.sql<DayCount[]>`
          SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                 COUNT(*)::int AS count
          FROM gap_queries
          WHERE created_at >= ${from} AND created_at < ${to}
          GROUP BY 1
          ORDER BY 1
        `,
        this.sql<SurfaceCount[]>`
          SELECT surface::text AS surface, COUNT(*)::int AS count
          FROM gap_queries
          WHERE created_at >= ${from} AND created_at < ${to}
          GROUP BY 1
          ORDER BY 2 DESC
        `,
        this.sql<CategoryCount[]>`
          SELECT c.id, c.label, COUNT(q.id)::int AS "queryCount",
                 MAX(q.created_at) AS "lastSeen"
          FROM gap_queries q
          JOIN gap_categories c ON c.id = q.category_id
          WHERE q.created_at >= ${from} AND q.created_at < ${to}
          GROUP BY c.id, c.label
          ORDER BY "queryCount" DESC, "lastSeen" DESC
          LIMIT 8
        `,
        this.sql<OutletCount[]>`
          SELECT outlet, COUNT(*)::int AS count
          FROM gap_queries
          WHERE created_at >= ${from} AND created_at < ${to}
            AND outlet IS NOT NULL AND btrim(outlet) <> ''
          GROUP BY outlet
          ORDER BY count DESC, outlet
          LIMIT 8
        `,
      ]);

    return {
      total: totals?.total ?? 0,
      categories: allCategories?.count ?? 0,
      newCategories: created?.count ?? 0,
      daily,
      surfaces,
      topCategories,
      topOutlets,
    };
  }
}
