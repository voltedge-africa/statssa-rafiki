import {
  getDocument,
  listDocuments,
  openDatabase,
  type IndexedDocument,
  type IndexedDocumentSummary,
  type RagDatabase,
} from "./db.ts";

let connection: RagDatabase | undefined;

function database(): RagDatabase {
  connection ??= openDatabase();
  return connection;
}

export async function retrieveDocument(source: string): Promise<IndexedDocument | undefined> {
  try {
    return await getDocument(database(), source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`RAG index unavailable (${detail}). Run \`vp run api#rag:ingest\` first.`, {
      cause: error,
    });
  }
}

/** Every indexed document, for the analysis builder's document picker. */
export async function listIndexedDocuments(): Promise<IndexedDocumentSummary[]> {
  try {
    return await listDocuments(database());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`RAG index unavailable (${detail}). Run \`vp run api#rag:ingest\` first.`, {
      cause: error,
    });
  }
}
