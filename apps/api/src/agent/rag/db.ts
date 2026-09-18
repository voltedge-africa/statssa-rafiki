import postgres, { type Sql } from "postgres";
import {
  DATABASE_URL,
  EMBED_DIM,
  MAX_DF_RATIO,
  MIN_SIMILARITY,
  RRF_K,
  STRICT_SIMILARITY,
} from "./config.ts";

export type RagDatabase = Sql;

export interface DocumentInput {
  source: string;
  title: string | null;
  sha256: string;
  /** Full normalized document text, served verbatim by the document preview. */
  text: string;
  meta?: postgres.JSONValue;
}

/** One chunk to store, with the heading/page metadata it was split on. */
export interface ChunkInput {
  heading: string | null;
  page: number | null;
  text: string;
}

export interface RagHit {
  chunkId: number;
  documentId: number;
  source: string;
  title: string | null;
  heading: string | null;
  page: number | null;
  text: string;
  score: number;
  similarity?: number;
  keywordRank?: number;
  vectorRank?: number;
}

export interface IndexedDocument {
  source: string;
  title: string | null;
  text: string;
}

/** pgvector accepts a bracketed string literal, e.g. `[0.1,0.2,...]`. */
export function vectorLiteral(vector: Float32Array): string {
  return `[${Array.from(vector).join(",")}]`;
}

export async function initSchema(db: RagDatabase): Promise<void> {
  const dim = Number.isInteger(EMBED_DIM) && EMBED_DIM > 0 ? EMBED_DIM : 384;

  await db.unsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS documents (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      source text NOT NULL UNIQUE,
      title text,
      sha256 text NOT NULL,
      text text NOT NULL DEFAULT '',
      meta jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.unsafe(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS text text NOT NULL DEFAULT '';`);
  await db.unsafe(`CREATE INDEX IF NOT EXISTS documents_sha_idx ON documents (sha256);`);
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS chunks (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      document_id integer NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
      ordinal integer NOT NULL,
      heading text,
      page integer,
      text text NOT NULL,
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, text)) STORED,
      embedding vector(${dim}) NOT NULL
    );
  `);
  await db.unsafe(`ALTER TABLE chunks ADD COLUMN IF NOT EXISTS heading text;`);
  await db.unsafe(`ALTER TABLE chunks ADD COLUMN IF NOT EXISTS page integer;`);
  await db.unsafe(`CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks (document_id);`);
  await db.unsafe(`CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv);`);
  await db.unsafe(
    `CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);`,
  );
}

export function openDatabase(url = DATABASE_URL): RagDatabase {
  return postgres(url, { max: 4, onnotice: () => undefined });
}

export async function indexStats(db: RagDatabase): Promise<{ documents: number; chunks: number }> {
  const [row] = await db<{ documents: number; chunks: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM documents) AS documents,
      (SELECT COUNT(*)::int FROM chunks) AS chunks
  `;
  return row ?? { documents: 0, chunks: 0 };
}

export async function getDocument(
  db: RagDatabase,
  source: string,
): Promise<IndexedDocument | undefined> {
  const [document] = await db<{ source: string; title: string | null; text: string }[]>`
    SELECT source, title, text FROM documents WHERE source = ${source}
  `;
  if (!document) return undefined;

  return {
    source: document.source,
    title: document.title,
    text: document.text,
  };
}

/**
 * Insert or replace a document keyed by `source`. Returns false when the content
 * hash is unchanged, so re-ingesting an identical corpus is a no-op.
 */
export async function upsertDocument(
  db: RagDatabase,
  document: DocumentInput,
  chunks: ChunkInput[],
  vectors: Float32Array[],
): Promise<boolean> {
  if (chunks.length !== vectors.length) {
    throw new Error(`chunks (${chunks.length}) and vectors (${vectors.length}) length mismatch`);
  }

  const [existing] = await db<{ id: number; sha256: string; text: string }[]>`
    SELECT id, sha256, text FROM documents WHERE source = ${document.source}
  `;
  if (existing && existing.sha256 === document.sha256 && existing.text === document.text) {
    return false;
  }

  await db.begin(async (tx) => {
    if (existing) {
      await tx`DELETE FROM documents WHERE id = ${existing.id}`;
    }

    const [inserted] = await tx<{ id: number }[]>`
      INSERT INTO documents (source, title, sha256, text, meta)
      VALUES (
        ${document.source},
        ${document.title},
        ${document.sha256},
        ${document.text},
        ${document.meta ? tx.json(document.meta) : null}
      )
      RETURNING id
    `;
    if (!inserted) throw new Error("insert returned no document id");

    for (const [ordinal, chunk] of chunks.entries()) {
      await tx`
        INSERT INTO chunks (document_id, ordinal, heading, page, text, embedding)
        VALUES (
          ${inserted.id},
          ${ordinal},
          ${chunk.heading},
          ${chunk.page},
          ${chunk.text},
          ${vectorLiteral(vectors[ordinal])}::vector
        )
      `;
    }
  });

  return true;
}

const STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "based",
  "be",
  "been",
  "by",
  "can",
  "could",
  "describe",
  "did",
  "do",
  "does",
  "explain",
  "for",
  "from",
  "give",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "its",
  "like",
  "list",
  "me",
  "my",
  "need",
  "of",
  "on",
  "opinion",
  "or",
  "our",
  "over",
  "provide",
  "regarding",
  "she",
  "should",
  "show",
  "so",
  "support",
  "tell",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "us",
  "use",
  "used",
  "using",
  "want",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

function tokenize(query: string): string[] {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(terms)].filter((term) => term.length > 1 && !STOPWORDS.has(term));
}

/** Postgres `tsquery` needs each term quoted; tokenize() keeps terms alphanumeric. */
function buildTsQuery(terms: string[]): string {
  return terms.map((term) => `'${term}'`).join(" | ");
}

/**
 * Keep only terms that occur in the corpus but not in a large share of its documents.
 * Document-level frequency is used (not chunk-level) so boilerplate repeated in every
 * chunk of a few documents ("Stats SA", "South Africa") is treated as non-discriminative.
 */
async function discriminativeTerms(db: RagDatabase, query: string): Promise<string[]> {
  const [counts] = await db<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM documents`;
  const totalDocs = counts?.n ?? 0;
  if (totalDocs === 0) return [];

  const maxDf = Math.max(1, Math.floor(totalDocs * MAX_DF_RATIO));
  const kept: string[] = [];

  for (const term of tokenize(query)) {
    const [row] = await db<{ n: number }[]>`
      SELECT COUNT(DISTINCT document_id)::int AS n
      FROM chunks
      WHERE tsv @@ to_tsquery('simple', ${`'${term}'`})
    `;
    const df = row?.n ?? 0;
    if (df > 0 && df <= maxDf) kept.push(term);
  }

  return kept;
}

interface KeywordRow {
  chunkId: number;
  documentId: number;
  source: string;
  title: string | null;
  heading: string | null;
  page: number | null;
  text: string;
  rank: number;
}

interface VectorRow {
  chunkId: number;
  documentId: number;
  source: string;
  title: string | null;
  heading: string | null;
  page: number | null;
  text: string;
  distance: number;
}

export async function keywordSearch(
  db: RagDatabase,
  terms: string[],
  limit: number,
): Promise<RagHit[]> {
  const query = buildTsQuery(terms);
  if (!query) return [];

  const rows = await db<KeywordRow[]>`
    SELECT c.id AS "chunkId", c.text AS text, c.heading AS heading, c.page AS page,
           d.id AS "documentId", d.source AS source,
           d.title AS title, ts_rank_cd(c.tsv, to_tsquery('simple', ${query})) AS rank
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.tsv @@ to_tsquery('simple', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    chunkId: row.chunkId,
    documentId: row.documentId,
    source: row.source,
    title: row.title,
    heading: row.heading,
    page: row.page,
    text: row.text,
    score: 0,
  }));
}

export async function vectorSearch(
  db: RagDatabase,
  embedding: Float32Array,
  limit: number,
  minSimilarity: number,
): Promise<RagHit[]> {
  const rows = await db<VectorRow[]>`
    SELECT c.id AS "chunkId", c.text AS text, c.heading AS heading, c.page AS page,
           d.id AS "documentId", d.source AS source,
           d.title AS title, c.embedding <=> ${vectorLiteral(embedding)}::vector AS distance
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    ORDER BY distance
    LIMIT ${limit}
  `;

  return rows
    .map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      source: row.source,
      title: row.title,
      heading: row.heading,
      page: row.page,
      text: row.text,
      score: 0,
      similarity: 1 - row.distance,
    }))
    .filter((hit) => (hit.similarity ?? 0) >= minSimilarity);
}

/**
 * Reciprocal Rank Fusion of keyword and vector rankings.
 *
 * Both branches are relevance-gated before fusion. Keyword search drops
 * non-discriminative terms. Vector search uses MIN_SIMILARITY when the query has
 * a discriminative lexical anchor, and the stricter STRICT_SIMILARITY when it does
 * not, so queries with no grounding in the corpus return nothing instead of the
 * nearest (but irrelevant) neighbours.
 */
export async function hybridSearch(
  db: RagDatabase,
  query: string,
  embedding: Float32Array,
  k: number,
): Promise<RagHit[]> {
  const pool = Math.max(k * 4, 20);
  const terms = await discriminativeTerms(db, query);
  const minSimilarity = terms.length > 0 ? MIN_SIMILARITY : STRICT_SIMILARITY;
  const [keyword, vector] = await Promise.all([
    keywordSearch(db, terms, pool),
    vectorSearch(db, embedding, pool, minSimilarity),
  ]);

  if (keyword.length === 0 && vector.length === 0) return [];

  const merged = new Map<number, RagHit>();

  keyword.forEach((hit, index) => {
    merged.set(hit.chunkId, {
      ...hit,
      score: 1 / (RRF_K + index + 1),
      keywordRank: index + 1,
    });
  });

  vector.forEach((hit, index) => {
    const contribution = 1 / (RRF_K + index + 1);
    const existing = merged.get(hit.chunkId);
    if (existing) {
      existing.score += contribution;
      existing.vectorRank = index + 1;
      existing.similarity = hit.similarity;
    } else {
      merged.set(hit.chunkId, { ...hit, score: contribution, vectorRank: index + 1 });
    }
  });

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
