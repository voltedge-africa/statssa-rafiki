import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import { orDefault } from "../env.ts";
import { parseCsv } from "./factstore-csv.ts";
import { closeFactStore, ensureFactStore, FACT_DATABASE_URL, FACT_SCHEMA } from "./factstore.ts";

/**
 * Load the fact_store/ CSVs into the `factstore` schema.
 *
 *   node src/agent/factstore-load.ts
 *
 * One CSV per table (the filename is the table name). Column types are inferred
 * from the data: `numeric` when every non-empty cell parses as a number,
 * otherwise `text`. Each table is dropped and recreated, so the load is
 * idempotent and always reflects the CSVs on disk.
 */
const FACT_STORE_DIR = resolve(orDefault("FACT_STORE_DIR", "fact_store"));

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function inferType(values: string[]): "numeric" | "text" {
  const nonEmpty = values.filter((value) => value !== "");
  if (nonEmpty.length === 0) return "text";
  return nonEmpty.every((value) => /^-?\d+(?:\.\d+)?$/.test(value)) ? "numeric" : "text";
}

async function main(): Promise<void> {
  await ensureFactStore();

  const db = postgres(FACT_DATABASE_URL, { max: 1, onnotice: () => undefined });
  try {
    const files = (await readdir(FACT_STORE_DIR))
      .filter((file) => file.toLowerCase().endsWith(".csv"))
      .sort();

    if (files.length === 0) {
      console.error(`No CSVs in ${FACT_STORE_DIR}. Run \`vp run api#factstore:derive\` first.`);
      process.exitCode = 1;
      return;
    }

    console.log(`Fact store: ${new URL(FACT_DATABASE_URL).pathname.slice(1)}`);
    console.log(`Source:     ${FACT_STORE_DIR}\n`);

    let total = 0;

    for (const file of files) {
      const name = file.replace(/\.csv$/i, "");
      const grid = parseCsv(await readFile(resolve(FACT_STORE_DIR, file), "utf8"));
      if (grid.length < 1 || grid[0].length === 0) {
        console.error(`skip  ${name} (empty)`);
        continue;
      }

      const header = grid[0];
      const body = grid.slice(1).filter((row) => row.length === header.length);
      if (body.length !== grid.length - 1) {
        console.warn(`warn  ${name}: dropped ${grid.length - 1 - body.length} malformed row(s)`);
      }

      const types = header.map((_, index) => inferType(body.map((row) => row[index] ?? "")));

      await db.begin(async (tx) => {
        await tx.unsafe(`DROP TABLE IF EXISTS ${FACT_SCHEMA}.${quoteIdentifier(name)}`);
        const columns = header
          .map((column, index) => `${quoteIdentifier(column)} ${types[index]}`)
          .join(", ");
        await tx.unsafe(`CREATE TABLE ${FACT_SCHEMA}.${quoteIdentifier(name)} (${columns})`);

        for (const row of body) {
          const placeholders = row.map((_, index) => `$${index + 1}`).join(", ");
          const values = row.map((value, index) =>
            types[index] === "numeric" && value !== "" ? Number(value) : value,
          );
          await tx.unsafe(
            `INSERT INTO ${FACT_SCHEMA}.${quoteIdentifier(name)} VALUES (${placeholders})`,
            values as never[],
          );
        }
      });

      total += body.length;
      console.log(`load  ${name} (${body.length} rows)`);
    }

    console.log(`\nDone. ${files.length} tables, ${total} rows.`);
  } finally {
    await db.end();
    await closeFactStore();
  }
}

await main();
