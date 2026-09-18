import { existsSync } from "node:fs";
import { DB_PATH } from "./config.ts";
import { getDocument, openReadonly, type IndexedDocument, type RagDatabase } from "./db.ts";

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

export function retrieveDocument(source: string): IndexedDocument | undefined {
  return getDocument(database(), source);
}
