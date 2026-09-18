import { resolve } from "node:path";

export const RAG_DIR = resolve(process.env.RAG_DIR ?? "data");
export const DB_PATH = resolve(RAG_DIR, process.env.RAG_DB ?? "rag.db");
export const CORPUS_DIR = resolve(process.env.RAG_CORPUS ?? "corpus");
export const MODELS_DIR = resolve(process.env.RAG_MODELS_DIR ?? "models");

export const MODEL_ID = process.env.RAG_MODEL ?? "Xenova/multilingual-e5-small";
export const EMBED_DIM = Number(process.env.RAG_EMBED_DIM ?? 384);
export const EMBED_BATCH = Number(process.env.RAG_EMBED_BATCH ?? 16);

/** Only the one-time model download script sets this. The server and ingest never do. */
export const ALLOW_DOWNLOAD = process.env.RAG_ALLOW_DOWNLOAD === "1";

export const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE ?? 1200);
export const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP ?? 160);
export const RRF_K = 60;
export const DEFAULT_TOP_K = 6;

/**
 * Minimum cosine similarity for a vector hit to count as relevant when the query
 * also has at least one discriminative lexical term grounding it in the corpus.
 */
export const MIN_SIMILARITY = Number(process.env.RAG_MIN_SIMILARITY ?? 0.8);

/**
 * Stricter threshold used when the query shares no discriminative term with the
 * corpus. Guards against boilerplate similarity on small or homogeneous corpora.
 */
export const STRICT_SIMILARITY = Number(process.env.RAG_STRICT_SIMILARITY ?? 0.86);

/**
 * Terms appearing in more than this fraction of chunks are treated as non-discriminative
 * and dropped from keyword search, so generic words can't match the whole corpus.
 */
export const MAX_DF_RATIO = Number(process.env.RAG_MAX_DF_RATIO ?? 0.3);
