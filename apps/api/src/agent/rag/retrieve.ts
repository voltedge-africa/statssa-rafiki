import { existsSync } from "node:fs";
import { DB_PATH, DEFAULT_TOP_K } from "./config.ts";
import { hybridSearch, openReadonly, type RagDatabase, type RagHit } from "./db.ts";
import { embedQuery } from "./embed.ts";

let connection: RagDatabase | undefined;

function database(): RagDatabase {
  if (!connection) {
    if (!existsSync(DB_PATH)) {
      throw new Error(`RAG index not found at ${DB_PATH}. Run \`pnpm rag:ingest\` first.`);
    }
    connection = openReadonly(DB_PATH);
  }
  return connection;
}

export async function retrieve(query: string, k: number = DEFAULT_TOP_K): Promise<RagHit[]> {
  const db = database();
  const embedding = await embedQuery(query);
  return hybridSearch(db, query, embedding, k);
}

export type { RagHit };
