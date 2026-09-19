import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import postgres, { type Sql } from "postgres";
import { orDefault } from "../env.ts";

/**
 * Postgres database holding the published-tables layer (the `factstore` schema
 * loaded from the fact_store/ CSVs). Kept in its own database so the agent's
 * SQL tool can never touch the auth or RAG databases: within this database the
 * only data is the factstore schema itself.
 */
export const FACT_DATABASE_URL = orDefault(
  "FACT_DATABASE_URL",
  "postgres://rafiki:rafiki@127.0.0.1:5432/rafiki_fact",
);

export const FACT_SCHEMA = "factstore";

/** Kill runaway queries. */
const STATEMENT_TIMEOUT_MS = 15_000;

/** Cap the rows sent back to the model context. */
const MAX_RESULT_ROWS = 100;

let connection: Sql | undefined;

function database(): Sql {
  connection ??= postgres(FACT_DATABASE_URL, { max: 4, onnotice: () => undefined });
  return connection;
}

/** Close the shared connection so one-shot CLI scripts can exit. */
export async function closeFactStore(): Promise<void> {
  if (!connection) return;
  const current = connection;
  connection = undefined;
  await current.end();
}

/** Create the fact database when it does not exist yet, connecting through `postgres`. */
async function ensureDatabase(url: string): Promise<void> {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!name) throw new Error("FACT_DATABASE_URL does not include a database name");

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => undefined });

  try {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${name}) AS exists
    `;
    if (!row?.exists) {
      await sql.unsafe(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await sql.end();
  }
}

let prepared: Promise<void> | undefined;

/** Lazily create the fact database and schema. Tables arrive via the CSV loader. */
async function prepare(): Promise<void> {
  prepared ??= (async () => {
    try {
      await ensureDatabase(FACT_DATABASE_URL);
      await database().unsafe(`CREATE SCHEMA IF NOT EXISTS ${FACT_SCHEMA}`);
    } catch (error) {
      prepared = undefined;
      throw error;
    }
  })();
  return prepared;
}

const FORBIDDEN_STATEMENT =
  /\b(insert|update|delete|drop|truncate|create|alter|rename|grant|revoke|copy|call|do|vacuum|analyze|reindex|cluster|set|reset|begin|commit|rollback|savepoint|release|prepare|execute|deallocate|declare|fetch|move|listen|notify|unlisten|load|discard|merge|refresh|checkpoint)\b/i;

/**
 * Strict gate for LLM-supplied SQL. Only a single read-only statement may pass.
 * The transaction wrapper below (`BEGIN read only`) is the hard guarantee;
 * this rejects obvious write statements before they ever reach Postgres.
 */
export function sanitizeSql(raw: string): { sql: string } | { error: string } {
  const sql = raw.trim().replace(/;+\s*$/, "");
  if (!sql) return { error: "The SQL query is empty." };
  if (sql.includes(";")) {
    return { error: "Only a single SELECT statement is allowed (no semicolons)." };
  }
  if (!/^(select|with)\b/i.test(sql)) {
    return {
      error: "Only SELECT (or WITH ... SELECT) queries are allowed against the factstore schema.",
    };
  }
  if (FORBIDDEN_STATEMENT.test(sql)) {
    return { error: "The query contains statements that are not read-only." };
  }
  return { sql };
}

export interface FactQueryResult {
  rows: unknown[];
  truncated: boolean;
  rowCount: number;
}

/** Create the fact database and schema if they do not exist. Used by the CSV loader. */
export async function ensureFactStore(): Promise<void> {
  await prepare();
}

/** True when the factstore schema has at least one loaded data table. */
export async function hasFactTables(): Promise<boolean> {
  await prepare();
  const [row] = await database()<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM information_schema.tables
    WHERE table_schema = ${FACT_SCHEMA} AND table_name <> 'table_descriptions'
  `;
  return (row?.n ?? 0) > 0;
}

/**
 * Execute a sanitized SELECT inside a `BEGIN read only` transaction: Postgres
 * itself rejects any write, and the search path is pinned to `factstore` so
 * unqualified table names resolve there.
 */
export async function runFactQuery(sql: string): Promise<FactQueryResult> {
  await prepare();
  const db = database();

  return db.begin("read only", async (tx) => {
    await tx.unsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    await tx.unsafe(`SET LOCAL search_path TO ${FACT_SCHEMA}`);
    const rows = await tx.unsafe(sql);
    const truncated = rows.length > MAX_RESULT_ROWS;
    return {
      rows: truncated ? rows.slice(0, MAX_RESULT_ROWS) : rows,
      truncated,
      rowCount: rows.length,
    };
  });
}

const REFUSAL =
  'Tell the user the fact store does not contain this information and output exactly "The provided Stats SA documentation does not contain this information." and nothing else.';

const RETRY_GUIDANCE =
  "Fix the SQL and call query_factstore again; do not answer and do not refuse until you have seen the actual result rows.";

/** Double-quote an identifier so hyphenated CSV-derived table names stay valid SQL. */
function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

const QueryFactstoreParameters = Type.Object({
  sql: Type.String({
    description:
      'A single read-only SELECT query (no semicolons) against the factstore schema. Qualify tables with `factstore.` or rely on the default search path. Double-quote any table or column name containing a hyphen, e.g. SELECT * FROM factstore."time-series-2002-2025". Use LIMIT to keep results small.',
  }),
});

export const queryFactstore: AgentTool<
  typeof QueryFactstoreParameters,
  { rows: unknown[]; rowCount: number }
> = {
  name: "query_factstore",
  label: "Query fact store",
  description:
    "STEP 2 of the fact-store lookup. Run a single read-only SQL SELECT against the published-tables schema `factstore`. Always call list_fact_tables (step 1) first to learn the table and column names, then call this tool with the actual SQL. You MUST call this tool and read its rows before answering any question about exact numbers, statistics, metrics or table values; refusing is only valid when this tool actually returned zero rows. Never take exact statistics from search_statssa passages instead.",
  parameters: QueryFactstoreParameters,
  execute: async (_toolCallId, params) => {
    const checked = sanitizeSql(params.sql);
    if ("error" in checked) {
      return {
        content: [
          {
            type: "text",
            text: `Query rejected: ${checked.error}. ${RETRY_GUIDANCE}`,
          },
        ],
        details: { rows: [], rowCount: 0 },
      };
    }

    try {
      const result = await runFactQuery(checked.sql);
      if (result.rowCount === 0) {
        return {
          content: [{ type: "text", text: `The query returned no rows. ${REFUSAL}` }],
          details: { rows: [], rowCount: 0 },
        };
      }

      const text = [
        `The query returned ${result.rowCount} row(s).`,
        ...(result.truncated
          ? [
              `(Showing the first ${MAX_RESULT_ROWS} rows; refine the query with WHERE or LIMIT to see the rest.)`,
            ]
          : []),
        JSON.stringify(result.rows, null, 2),
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: { rows: result.rows, rowCount: result.rowCount },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Fact store query failed: ${message}. ${RETRY_GUIDANCE}` }],
        details: { rows: [], rowCount: 0 },
      };
    }
  },
};

interface SchemaColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

const ListFactTablesParameters = Type.Object({});

export const listFactTables: AgentTool<typeof ListFactTablesParameters, { tables: number }> = {
  name: "list_fact_tables",
  label: "List fact store tables",
  description:
    "STEP 1 of the fact-store lookup. List every table and column in the `factstore` schema, with row counts and any human-written descriptions, so you can pick the table holding the statistic being asked about. Call this FIRST whenever the user asks for a statistical figure; after it returns you MUST immediately call query_factstore (step 2) with a SELECT against the most relevant table before answering or refusing.",
  parameters: ListFactTablesParameters,
  execute: async (_toolCallId) => {
    try {
      await prepare();
      const db = database();

      const rows = await db<SchemaColumn[]>`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = ${FACT_SCHEMA} AND table_name <> 'table_descriptions'
        ORDER BY table_name, ordinal_position
      `;

      if (rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `The ${FACT_SCHEMA} schema contains no tables yet. ${REFUSAL}`,
            },
          ],
          details: { tables: 0 },
        };
      }

      const byTable = new Map<string, string[]>();
      for (const row of rows) {
        const columns = byTable.get(row.table_name) ?? [];
        columns.push(`${row.column_name} ${row.data_type}${row.is_nullable === "YES" ? "?" : ""}`);
        byTable.set(row.table_name, columns);
      }
      const tableNames = [...byTable.keys()];

      // Optional human-written descriptions: factstore.table_descriptions
      // (table_name text, description text). Absent table -> no descriptions.
      const descriptions = new Map<string, string>();
      try {
        const [descExists] = await db<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = ${FACT_SCHEMA} AND table_name = 'table_descriptions'
          ) AS exists
        `;
        if (descExists?.exists) {
          const descRows = await db.unsafe<{ table_name: string; description: string }[]>(
            `SELECT table_name, description FROM ${FACT_SCHEMA}.${quoteIdentifier("table_descriptions")}`,
          );
          for (const desc of descRows) {
            if (desc.table_name && desc.description)
              descriptions.set(desc.table_name, desc.description);
          }
        }
      } catch {
        // Descriptions are optional; a malformed descriptions table must not break listing.
      }

      // Exact row counts so the model can tell populated tables from empty ones.
      const counts = new Map<string, number>();
      for (const tableName of tableNames) {
        try {
          const [countRow] = await db.unsafe<{ n: number }[]>(
            `SELECT COUNT(*)::int AS n FROM ${FACT_SCHEMA}.${quoteIdentifier(tableName)}`,
          );
          counts.set(tableName, countRow?.n ?? 0);
        } catch {
          counts.set(tableName, 0);
        }
      }

      const lines = tableNames.map((table) => {
        const description = descriptions.get(table);
        const suffix = description ? ` — ${description}` : "";
        return [
          `${FACT_SCHEMA}.${table}${suffix} (rows: ${counts.get(table) ?? 0})`,
          `  columns: ${byTable.get(table)?.join(", ") ?? ""}`,
        ].join("\n");
      });

      const text = [
        `The ${FACT_SCHEMA} schema contains ${byTable.size} table(s):`,
        ...lines,
        "Next step: call query_factstore with a SELECT against the most relevant table.",
        'Double-quote any identifier containing a hyphen, e.g. SELECT * FROM factstore."time-series-2002-2025". Use LIMIT for large tables.',
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: { tables: byTable.size },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Fact store unavailable: ${message}` }],
        details: { tables: 0 },
      };
    }
  },
};
