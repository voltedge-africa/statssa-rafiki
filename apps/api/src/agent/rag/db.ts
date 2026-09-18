import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import {
  DB_PATH,
  EMBED_DIM,
  MAX_DF_RATIO,
  MIN_SIMILARITY,
  RRF_K,
  STRICT_SIMILARITY,
} from "./config.ts";

export type RagDatabase = Database.Database;

export interface DocumentInput {
  source: string;
  title: string | null;
  sha256: string;
  meta?: Record<string, unknown>;
}

export interface RagHit {
  chunkId: number;
  documentId: number;
  source: string;
  title: string | null;
  text: string;
  score: number;
  similarity?: number;
  keywordRank?: number;
  vectorRank?: number;
}

export function vectorBuffer(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function initSchema(db: RagDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      source TEXT NOT NULL UNIQUE,
      title TEXT,
      sha256 TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS documents_sha_idx ON documents(sha256);

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks(document_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      text,
      content='chunks',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
    END;

    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      embedding float[${EMBED_DIM}]
    );
  `);
}

export function openDatabase(path = DB_PATH): RagDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  return db;
}

export function openReadonly(path = DB_PATH): RagDatabase {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  sqliteVec.load(db);
  return db;
}

export function indexStats(db: RagDatabase): { documents: number; chunks: number } {
  const documents = (db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n;
  const chunks = (db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n;
  return { documents, chunks };
}

export interface IndexedDocument {
  source: string;
  title: string | null;
  text: string;
}

export function getDocument(db: RagDatabase, source: string): IndexedDocument | undefined {
  const document = db
    .prepare("SELECT id, source, title FROM documents WHERE source = ?")
    .get(source) as { id: number; source: string; title: string | null } | undefined;
  if (!document) return undefined;

  const chunks = db
    .prepare("SELECT text FROM chunks WHERE document_id = ? ORDER BY ordinal")
    .all(document.id) as { text: string }[];

  return {
    source: document.source,
    title: document.title,
    text: chunks.map((chunk) => chunk.text).join("\n\n"),
  };
}

/**
 * Insert or replace a document keyed by `source`. Returns false when the content
 * hash is unchanged, so re-ingesting an identical corpus is a no-op.
 */
export function upsertDocument(
  db: RagDatabase,
  document: DocumentInput,
  chunks: string[],
  vectors: Float32Array[],
): boolean {
  if (chunks.length !== vectors.length) {
    throw new Error(`chunks (${chunks.length}) and vectors (${vectors.length}) length mismatch`);
  }

  const existing = db
    .prepare("SELECT id, sha256 FROM documents WHERE source = ?")
    .get(document.source) as { id: number; sha256: string } | undefined;

  if (existing && existing.sha256 === document.sha256) return false;

  const run = db.transaction(() => {
    if (existing) {
      const oldIds = db.prepare("SELECT id FROM chunks WHERE document_id = ?").all(existing.id) as {
        id: number;
      }[];
      const deleteVector = db.prepare("DELETE FROM chunk_vectors WHERE chunk_id = ?");
      for (const row of oldIds) deleteVector.run(BigInt(row.id));
      db.prepare("DELETE FROM documents WHERE id = ?").run(existing.id);
    }

    const info = db
      .prepare(
        "INSERT INTO documents(source, title, sha256, meta, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        document.source,
        document.title,
        document.sha256,
        document.meta ? JSON.stringify(document.meta) : null,
        Date.now(),
      );
    const documentId = Number(info.lastInsertRowid);

    const insertChunk = db.prepare(
      "INSERT INTO chunks(document_id, ordinal, text) VALUES (?, ?, ?)",
    );
    const insertVector = db.prepare("INSERT INTO chunk_vectors(chunk_id, embedding) VALUES (?, ?)");

    chunks.forEach((text, ordinal) => {
      const result = insertChunk.run(documentId, ordinal, text);
      insertVector.run(BigInt(Number(result.lastInsertRowid)), vectorBuffer(vectors[ordinal]));
    });
  });

  run();
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

/**
 * Keep only terms that occur in the corpus but not in a large share of its documents.
 * Document-level frequency is used (not chunk-level) so boilerplate repeated in every
 * chunk of a few documents ("Stats SA", "South Africa") is treated as non-discriminative.
 */
function discriminativeTerms(db: RagDatabase, query: string): string[] {
  const totalDocs = (db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n;
  if (totalDocs === 0) return [];
  const maxDf = Math.max(1, Math.floor(totalDocs * MAX_DF_RATIO));
  const countStmt = db.prepare(
    `SELECT COUNT(DISTINCT c.document_id) AS n
     FROM chunks_fts
     JOIN chunks c ON c.id = chunks_fts.rowid
     WHERE chunks_fts MATCH ?`,
  );
  return tokenize(query).filter((term) => {
    const df = (countStmt.get(`"${term}"`) as { n: number }).n;
    return df > 0 && df <= maxDf;
  });
}

function buildFtsQuery(terms: string[]): string {
  return terms.map((term) => `"${term}"`).join(" OR ");
}

/** L2 distance between unit vectors maps to cosine similarity as 1 - d^2 / 2. */
function l2ToCosine(distance: number): number {
  return 1 - (distance * distance) / 2;
}

interface KeywordRow {
  chunkId: number;
  documentId: number;
  source: string;
  title: string | null;
  text: string;
  rank: number;
}

interface VectorRow {
  chunkId: number;
  documentId: number;
  source: string;
  title: string | null;
  text: string;
  distance: number;
}

export function keywordSearch(db: RagDatabase, terms: string[], limit: number): RagHit[] {
  const fts = buildFtsQuery(terms);
  if (!fts) return [];

  const rows = db
    .prepare(
      `SELECT c.id AS chunkId, c.text AS text, d.id AS documentId, d.source AS source,
              d.title AS title, bm25(chunks_fts) AS rank
       FROM chunks_fts
       JOIN chunks c ON c.id = chunks_fts.rowid
       JOIN documents d ON d.id = c.document_id
       WHERE chunks_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(fts, BigInt(limit)) as KeywordRow[];

  return rows.map((row) => ({
    chunkId: row.chunkId,
    documentId: row.documentId,
    source: row.source,
    title: row.title,
    text: row.text,
    score: 0,
  }));
}

export function vectorSearch(
  db: RagDatabase,
  embedding: Float32Array,
  limit: number,
  minSimilarity: number,
): RagHit[] {
  const rows = db
    .prepare(
      `SELECT v.chunk_id AS chunkId, v.distance AS distance, c.text AS text,
              d.id AS documentId, d.source AS source, d.title AS title
       FROM chunk_vectors v
       JOIN chunks c ON c.id = v.chunk_id
       JOIN documents d ON d.id = c.document_id
       WHERE v.embedding MATCH ? AND k = ?
       ORDER BY v.distance`,
    )
    .all(vectorBuffer(embedding), BigInt(limit)) as VectorRow[];

  return rows
    .map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      source: row.source,
      title: row.title,
      text: row.text,
      score: 0,
      similarity: l2ToCosine(row.distance),
    }))
    .filter((hit) => hit.similarity >= minSimilarity);
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
export function hybridSearch(
  db: RagDatabase,
  query: string,
  embedding: Float32Array,
  k: number,
): RagHit[] {
  const pool = Math.max(k * 4, 20);
  const terms = discriminativeTerms(db, query);
  const minSimilarity = terms.length > 0 ? MIN_SIMILARITY : STRICT_SIMILARITY;
  const keyword = keywordSearch(db, terms, pool);
  const vector = vectorSearch(db, embedding, pool, minSimilarity);

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
