import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_auth";

function createDb() {
  const client = postgres(connectionString, { max: 5 });
  return drizzle(client);
}

// `bun --hot` re-evaluates modules on change; a module-level pool would leak a connection on
// every reload, so keep one instance on the global object.
const globalForDb = globalThis as unknown as {
  __rafikiAuthDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__rafikiAuthDb ?? createDb();
globalForDb.__rafikiAuthDb = db;
