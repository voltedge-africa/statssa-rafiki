import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import postgres from "postgres";
import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  CORPUS_DIR,
  DATABASE_URL,
  EMBED_BATCH,
  MODEL_ID,
} from "./config.ts";
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

/** One ingest chunk: the text plus the metadata that travels with it to the LLM context. */
export interface Chunk {
  heading: string | null;
  page: number | null;
  text: string;
}

const PAGE_MARKER_RE = /^---[ \t]*\*Page (\d+)\*[ \t]*$/gm;
const TWO_LINE_PAGE_RE = /^---[ \t]*\r?\n[ \t]*\*Page (\d+)\*[ \t]*$/gm;
const HEADING_RE = /^(#{1,4})\s+(.+)$/;

/**
 * The converter emits page separators as two lines (`---` then `*Page N*`);
 * the blueprint's single-line form (`--- *Page N*`) is also accepted. Both are
 * normalised to the single-line form before splitting.
 */
function normalizePageMarkers(text: string): string {
  return text.replace(TWO_LINE_PAGE_RE, "--- *Page $1*");
}

/** Split on the `--- *Page N*` separators, tagging each segment with its page number. */
function splitPages(text: string): { page: number | null; text: string }[] {
  const segments: { page: number | null; text: string }[] = [];
  let page: number | null = null;
  let last = 0;
  let match: RegExpExecArray | null;
  PAGE_MARKER_RE.lastIndex = 0;
  while ((match = PAGE_MARKER_RE.exec(text)) !== null) {
    if (match.index > last) segments.push({ page, text: text.slice(last, match.index).trim() });
    page = Number(match[1]);
    last = match.index + match[0].length;
  }
  segments.push({ page, text: text.slice(last).trim() });
  return segments.filter((segment) => segment.text.length > 0);
}

/**
 * Split on `##` / `###` / `####` headings; each section keeps its heading.
 * Consecutive heading lines (as produced by slide-deck converters, where every
 * line of a page is a heading) are demoted to body text under the first
 * heading instead of fragmenting into one-line chunks.
 */
function splitHeadings(text: string): { heading: string | null; body: string }[] {
  const sections: { heading: string | null; body: string[] }[] = [];
  let heading: string | null = null;
  let body: string[] = [];
  let hasBodyContent = false;

  const flush = () => {
    sections.push({ heading, body });
    body = [];
    heading = null;
    hasBodyContent = false;
  };

  for (const line of text.split("\n")) {
    const match = HEADING_RE.exec(line.trim());
    if (match) {
      const headingText = match[2].trim();
      if (heading === null && !hasBodyContent) {
        heading = headingText;
      } else if (heading !== null && !hasBodyContent) {
        body.push(headingText);
      } else {
        flush();
        heading = headingText;
      }
      continue;
    }
    if (line.trim().length > 0) hasBodyContent = true;
    body.push(line);
  }
  flush();
  return sections
    .map((section) => ({ heading: section.heading, body: section.body.join("\n").trim() }))
    .filter((section) => section.heading !== null || section.body.length > 0);
}

/**
 * Emit chunks for one heading section (within one page). Sections that fit in
 * CHUNK_SIZE become a single chunk. Oversized sections fall back to paragraph
 * boundaries (with overlap) inside the section; every piece keeps its heading
 * and page marker prefix, so the metadata survives into the stored chunk text.
 */
function chunkSection(section: {
  page: number | null;
  heading: string | null;
  body: string;
}): Chunk[] {
  const prefixLines = [
    ...(section.heading === null ? [] : [`## ${section.heading}`]),
    ...(section.page === null ? [] : [`--- *Page ${section.page}*`]),
  ];
  const prefix = prefixLines.join("\n");
  const content = [prefix, section.body].filter(Boolean).join("\n\n");

  if (content.length <= CHUNK_SIZE) {
    return [{ heading: section.heading, page: section.page, text: content }];
  }

  const pieces: string[] = [];
  let current = "";
  for (const paragraph of section.body.split(/\n{2,}/)) {
    if (current && current.length + paragraph.length + 2 > CHUNK_SIZE) {
      pieces.push(current.trim());
      current = current.length > CHUNK_OVERLAP ? current.slice(-CHUNK_OVERLAP) : current;
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  if (current.trim()) pieces.push(current.trim());

  return pieces.flatMap(splitOversized).map((piece) => ({
    heading: section.heading,
    page: section.page,
    text: prefix ? `${prefix}\n\n${piece}` : piece,
  }));
}

/**
 * Markdown-aware chunking: page markers first, then `##` / `###` / `####`
 * headings, then paragraph fallback for oversized sections. Every chunk carries
 * its heading and page metadata and repeats them in the chunk text, so the LLM
 * context always shows where a passage came from.
 */
function chunkText(text: string): Chunk[] {
  const normalized = normalizePageMarkers(text.replace(/\r\n/g, "\n")).trim();
  if (!normalized) return [];

  const chunks: Chunk[] = [];
  for (const pageSegment of splitPages(normalized)) {
    for (const section of splitHeadings(pageSegment.text)) {
      chunks.push(
        ...chunkSection({ page: pageSegment.page, heading: section.heading, body: section.body }),
      );
    }
  }
  return chunks;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Create the RAG database when it does not exist yet, connecting through `postgres`. */
async function ensureDatabase(url: string): Promise<void> {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!name) throw new Error("RAG_DATABASE_URL does not include a database name");

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => undefined });

  try {
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${name}) AS exists
    `;
    if (!row?.exists) {
      await sql.unsafe(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      console.log(`Created database ${name}.`);
    }
  } catch (error) {
    console.error(`Could not prepare database "${name}":`);
    console.error(error instanceof Error ? error.message : error);
    console.error("Is Postgres running? Start it with `vp run db:up` from the repo root.");
    throw error;
  } finally {
    await sql.end();
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

  await ensureDatabase(DATABASE_URL);

  const db = openDatabase();
  try {
    await initSchema(db);

    const files = (await walk(corpus)).filter((file) => SUPPORTED.has(extname(file).toLowerCase()));
    console.log(`Corpus:   ${corpus}`);
    console.log(`Database: ${new URL(DATABASE_URL).pathname.slice(1)}`);
    console.log(`Model:    ${MODEL_ID}`);
    console.log(`Files:    ${files.length}\n`);

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
        vectors.push(...(await embedPassages(batch.map((chunk) => chunk.text))));
        process.stdout.write(`\r${source}: embedded ${vectors.length}/${chunks.length}`);
      }

      const changed = await upsertDocument(db, { source, title, sha256, text }, chunks, vectors);
      process.stdout.write("\n");
      if (changed) {
        written += 1;
        console.log(`write ${source} (${chunks.length} chunks)`);
      } else {
        skipped += 1;
        console.log(`skip  ${source} (unchanged)`);
      }
    }

    const stats = await indexStats(db);
    console.log(`\nDone. ${written} written, ${skipped} skipped.`);
    console.log(`Index: ${stats.documents} documents / ${stats.chunks} chunks.`);
  } finally {
    await db.end();
  }
}

await main();
