import { DEFAULT_TOP_K } from "./config.ts";
import { hybridSearch, openDatabase, type RagDatabase, type RagHit } from "./db.ts";
import { embedQuery } from "./embed.ts";

let connection: RagDatabase | undefined;

function database(): RagDatabase {
  connection ??= openDatabase();
  return connection;
}

function unavailable(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`RAG index unavailable (${detail}). Run \`vp run api#rag:ingest\` first.`, {
    cause: error,
  });
}

/**
 * Retrieve ranked passages. Pass `sources` to scope the search to specific
 * indexed documents, e.g. the documents an analysis brief is built from.
 */
export async function retrieve(
  query: string,
  k: number = DEFAULT_TOP_K,
  sources?: string[],
): Promise<RagHit[]> {
  const embedding = await embedQuery(query);
  try {
    return await hybridSearch(database(), query, embedding, k, sources);
  } catch (error) {
    throw unavailable(error);
  }
}

export type { RagHit };
