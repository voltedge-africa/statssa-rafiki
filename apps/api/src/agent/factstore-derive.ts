import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { orDefault } from "../env.ts";
import { toCsv } from "./factstore-csv.ts";
import { parseTable, TABLE_SPECS } from "./factstore-parse.ts";

/**
 * Derive the fact-store CSVs from the flattened GHS markdown corpus.
 *
 *   node src/agent/factstore-derive.ts
 *
 * Writes one CSV per curated table plus `table_descriptions.csv` into
 * `FACT_STORE_DIR` (default `fact_store/`). A table whose caption or column
 * header cannot be found fails the run, so a corpus edit cannot quietly drop
 * published figures.
 */
const CORPUS_DIR = resolve(orDefault("RAG_CORPUS", "corpus"));
const FACT_STORE_DIR = resolve(orDefault("FACT_STORE_DIR", "fact_store"));

async function main(): Promise<void> {
  await mkdir(FACT_STORE_DIR, { recursive: true });

  const sources = new Map<string, string>();
  const descriptions: string[][] = [["table_name", "description"]];
  let written = 0;

  console.log(`Corpus:    ${CORPUS_DIR}`);
  console.log(`Fact store: ${FACT_STORE_DIR}\n`);

  for (const spec of TABLE_SPECS) {
    let source = sources.get(spec.file);
    if (source === undefined) {
      source = await readFile(resolve(CORPUS_DIR, spec.file), "utf8");
      sources.set(spec.file, source);
    }

    const parsed = parseTable(spec, source);
    if (!parsed) {
      console.error(`fail  ${spec.name}: table ${spec.table} not found in ${spec.file}`);
      process.exitCode = 1;
      continue;
    }

    const grid = [
      spec.outColumns,
      ...parsed.rows.map((row) => [row.label, ...row.values.map((value) => value ?? "")]),
    ];
    await writeFile(resolve(FACT_STORE_DIR, `${spec.name}.csv`), toCsv(grid), "utf8");
    descriptions.push([spec.name, spec.description]);
    written += 1;
    console.log(
      `write ${spec.name} (${parsed.rows.length} rows${parsed.skipped ? `, ${parsed.skipped} skipped` : ""})`,
    );
  }

  await writeFile(resolve(FACT_STORE_DIR, "table_descriptions.csv"), toCsv(descriptions), "utf8");
  console.log(`\nDone. ${written}/${TABLE_SPECS.length} tables written.`);
}

await main();
