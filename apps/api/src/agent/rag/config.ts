import { resolve } from "node:path";
import { flag, numberOrDefault, orDefault } from "../../env.ts";

/**
 * Postgres database holding the RAG index. It needs the `pgvector` extension, which
 * `rag:ingest` enables. Kept separate from the auth database (`rafiki_auth`).
 */
export const DATABASE_URL = orDefault(
  "RAG_DATABASE_URL",
  "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_rag",
);

/** Directory of source documents to index (`.txt` / `.md` / `.json` / `.jsonl`). */
export const CORPUS_DIR = resolve(orDefault("RAG_CORPUS", "corpus"));

/** Local cache for the embedding model. */
export const MODELS_DIR = resolve(orDefault("RAG_MODELS_DIR", "models"));

export const MODEL_ID = orDefault("RAG_MODEL", "Xenova/multilingual-e5-small");
export const EMBED_DIM = numberOrDefault("RAG_EMBED_DIM", 384);
export const EMBED_BATCH = numberOrDefault("RAG_EMBED_BATCH", 16);

/** Only the one-time model download script sets this. The server and ingest never do. */
export const ALLOW_DOWNLOAD = flag("RAG_ALLOW_DOWNLOAD");

export const CHUNK_SIZE = numberOrDefault("RAG_CHUNK_SIZE", 1200);
export const CHUNK_OVERLAP = numberOrDefault("RAG_CHUNK_OVERLAP", 160);
export const RRF_K = 60;
export const DEFAULT_TOP_K = 6;

/**
 * Minimum cosine similarity for a vector hit to count as relevant when the query
 * also has at least one discriminative lexical term grounding it in the corpus.
 */
export const MIN_SIMILARITY = numberOrDefault("RAG_MIN_SIMILARITY", 0.8);

/**
 * Stricter threshold used when the query shares no discriminative term with the
 * corpus. Guards against boilerplate similarity on small or homogeneous corpora.
 */
export const STRICT_SIMILARITY = numberOrDefault("RAG_STRICT_SIMILARITY", 0.86);

/**
 * Terms appearing in more than this fraction of documents are treated as non-discriminative
 * and dropped from keyword search, so generic words can't match the whole corpus.
 */
export const MAX_DF_RATIO = numberOrDefault("RAG_MAX_DF_RATIO", 0.3);
