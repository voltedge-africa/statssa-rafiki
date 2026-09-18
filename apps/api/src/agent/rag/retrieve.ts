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

export async function retrieve(query: string, k: number = DEFAULT_TOP_K): Promise<RagHit[]> {
  const embedding = await embedQuery(query);
  try {
    return await hybridSearch(database(), query, embedding, k);
  } catch (error) {
    throw unavailable(error);
  }
}

export type { RagHit };
