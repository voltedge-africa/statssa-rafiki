import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { CHUNK_OVERLAP, CHUNK_SIZE, CORPUS_DIR, EMBED_BATCH, MODEL_ID } from "./config.ts";
import { indexStats, initSchema, openDatabase, upsertDocument } from "./db.ts";
import { embedPassages } from "./embed.ts";

const SUPPORTED = new Set([".txt", ".md", ".json", ".jsonl"]);

interface LoadedDocument {
  title: string | null;
  text: string;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function parseRecord(value: unknown): LoadedDocument {
  if (typeof value === "string") return { title: null, text: value };
  const record = value as { title?: string; text?: string; content?: string };
  return {
    title: record.title ?? null,
    text: record.text ?? record.content ?? JSON.stringify(record),
  };
}

async function load(path: string): Promise<LoadedDocument[]> {
  const ext = extname(path).toLowerCase();
  const raw = await readFile(path, "utf8");

  if (ext === ".jsonl") {
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => parseRecord(JSON.parse(line)))
      .filter((doc) => doc.text.trim().length > 0);
  }

  if (ext === ".json") {
    const parsed = JSON.parse(raw) as unknown;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map(parseRecord).filter((doc) => doc.text.trim().length > 0);
  }

  const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
  return [{ title, text: raw }];
}

function splitOversized(chunk: string): string[] {
  if (chunk.length <= CHUNK_SIZE * 1.5) return [chunk];
  const parts: string[] = [];
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  for (let start = 0; start < chunk.length; start += step) {
    parts.push(chunk.slice(start, start + CHUNK_SIZE).trim());
    if (start + CHUNK_SIZE >= chunk.length) break;
  }
  return parts.filter(Boolean);
}

function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];
  let current = "";
  for (const paragraph of normalized.split(/\n{2,}/)) {
    if (current && current.length + paragraph.length + 2 > CHUNK_SIZE) {
      chunks.push(current.trim());
      current = current.length > CHUNK_OVERLAP ? current.slice(-CHUNK_OVERLAP) : current;
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.flatMap(splitOversized);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const corpus = resolve(CORPUS_DIR);
  if (!(await exists(corpus))) {
    console.error(`Corpus directory not found: ${corpus}`);
    console.error(`Create it and add .txt / .md / .json / .jsonl files, or set RAG_CORPUS.`);
    process.exitCode = 1;
    return;
  }

  const db = openDatabase();
  initSchema(db);

  const files = (await walk(corpus)).filter((file) => SUPPORTED.has(extname(file).toLowerCase()));
  console.log(`Corpus: ${corpus}`);
  console.log(`Model:  ${MODEL_ID}`);
  console.log(`Files:  ${files.length}\n`);

  let written = 0;
  let skipped = 0;

  for (const file of files) {
    const source = relative(corpus, file);
    const bytes = await readFile(file);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const documents = await load(file);
    const text = documents.map((document) => document.text).join("\n\n");
    const title = documents.find((document) => document.title)?.title ?? source;
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      console.log(`skip  ${source} (no text)`);
      skipped += 1;
      continue;
    }

    const vectors: Float32Array[] = [];
    for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
      const batch = chunks.slice(start, start + EMBED_BATCH);
      vectors.push(...(await embedPassages(batch)));
      process.stdout.write(`\r${source}: embedded ${vectors.length}/${chunks.length}`);
    }

    const changed = upsertDocument(db, { source, title, sha256 }, chunks, vectors);
    process.stdout.write("\n");
    if (changed) {
      written += 1;
      console.log(`write ${source} (${chunks.length} chunks)`);
    } else {
      skipped += 1;
      console.log(`skip  ${source} (unchanged)`);
    }
  }

  const stats = indexStats(db);
  console.log(`\nDone. ${written} written, ${skipped} skipped.`);
  console.log(`Index: ${stats.documents} documents / ${stats.chunks} chunks.`);
  db.close();
}

await main();
