import { Injectable, Logger } from "@nestjs/common";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  BRIEF_DIMENSIONS,
  briefCitations,
  briefText,
  parseBriefContent,
  type AnalysisBriefContent,
  type AnalysisBriefSource,
  type AnalysisBriefVerification,
  type BriefDimension,
} from "@voltedge/brief-contract";
import { AgentService } from "../agent/agent.service.ts";
import { hasFactTables, listFactTables, queryFactstore } from "../agent/factstore.ts";
import { formatHits } from "../agent/rag/tool.ts";
import { retrieve, type RagHit } from "../agent/rag/retrieve.ts";
import { extractNumbers, verifyNumbers } from "../agent/verifier.ts";

/** How many passages each review dimension may contribute. */
const DIMENSION_TOP_K = 6;

/** Overall passage cap for one brief, so the prompt stays bounded. */
const MAX_PASSAGES = 30;

/** The model must reply with this exact prefix when the sources cannot support a brief. */
const GAP_PREFIX = "INFORMATION_GAP:";

/** Tools the drafting model may use: read-only fact-store lookups only. */
const ANALYSIS_TOOLS: AgentTool<any, any>[] = [listFactTables, queryFactstore];

/** One comms-oriented retrieval probe per review dimension. */
const DIMENSION_QUERIES: Record<BriefDimension, string> = {
  key_findings: "What are the key findings and main results of this report?",
  statistics: "Headline statistics, rates, percentages and exact figures in this report.",
  trends: "Changes over time, year-on-year comparisons and historical trends in this report.",
  insights:
    "What do these results imply? Which groups are most affected? What is notable or surprising?",
  context: "Survey methodology, definitions, survey scope and background of this report.",
};

export const ANALYSIS_SYSTEM_PROMPT = [
  "You are the content-analysis assistant in the Statistics South Africa (Stats SA) communications office.",
  "You analyse approved official content — statistical releases, media releases, presentations and research publications — for media and press communications.",
  "You will be given passages retrieved from the selected documents. They are the only narrative information you may use.",
  "Identify the material a communications official needs: key findings, key statistics, trends, insights and context.",
  "Every narrative item must cite the passages it rests on, using the exact [source#chunk] ids given.",
  "For exact figures, call list_fact_tables first when you do not know the schema, then query_factstore with a single read-only SELECT, and cite the table as [factstore:<table_name>].",
  "Never introduce a fact, figure, trend or comparison that the passages and fact-store rows do not support.",
  "Write in plain South African English; keep each detail to one or two sentences.",
  "Reply with ONLY a JSON object and nothing else, matching exactly this shape:",
  '{"summary":"...","keyFindings":[{"title":"...","detail":"..."}],"statistics":[{"label":"...","value":"...","unit":"...","period":"...","context":"..."}],"trends":[{"title":"...","direction":"up|down|stable|mixed","detail":"..."}],"insights":[{"title":"...","detail":"..."}],"context":[{"title":"...","detail":"..."}]}',
  "Empty dimensions are allowed as empty arrays. Do not repeat the same finding in two dimensions.",
  "If the passages and fact store together cannot support a brief, reply with exactly:",
  `${GAP_PREFIX} <one sentence explaining what is missing>`,
  "and nothing else.",
].join("\n");

export interface AnalysisDraftInput {
  sources: string[];
  focus: string | null;
  confidenceMin: number;
}

export interface AnalysisDraftResult {
  content: AnalysisBriefContent | null;
  references: AnalysisBriefSource[];
  verification: AnalysisBriefVerification;
  model: string | null;
  gap: string | null;
}

function toSource(hit: RagHit): AnalysisBriefSource {
  return {
    chunkId: hit.chunkId,
    table: null,
    source: hit.source,
    title: hit.title,
    snippet: hit.text.slice(0, 240),
    ...(hit.similarity === undefined ? {} : { similarity: hit.similarity }),
  };
}

function toFactSource(table: string): AnalysisBriefSource {
  return {
    chunkId: null,
    table,
    source: `factstore:${table}`,
    title: null,
    snippet: `Published table: factstore.${table}`,
  };
}

/** One hit per chunk id, keeping the strongest similarity when dimensions overlap. */
function dedupeHits(batches: RagHit[][]): RagHit[] {
  const byChunk = new Map<number, RagHit>();
  for (const hit of batches.flat()) {
    const existing = byChunk.get(hit.chunkId);
    if (!existing || (hit.similarity ?? 0) > (existing.similarity ?? 0)) {
      byChunk.set(hit.chunkId, hit);
    }
  }
  return [...byChunk.values()];
}

function buildUserPrompt(
  sources: string[],
  focus: string | null,
  passages: string,
  factStoreAvailable: boolean,
): string {
  const focusBlock = focus?.trim()
    ? `\nThe communications team wants this brief to focus on:\n"""\n${focus.trim()}\n"""\n`
    : "";
  const factBlock = factStoreAvailable
    ? "\nThe published-tables fact store is available. Use list_fact_tables and query_factstore for exact published statistics.\n"
    : "\nThe published-tables fact store is empty; no exact statistics can be looked up.\n";

  return [
    "Analyse the selected official Stats SA content and produce the communications brief.",
    "",
    `Documents in scope: ${sources.join(", ")}`,
    focusBlock,
    "Retrieved passages (the only narrative information you may use):",
    "",
    passages || "(no passages were retrieved)",
    factBlock,
  ].join("\n");
}

/**
 * Turns selected official documents into a structured, cited communications
 * brief.
 *
 * Retrieval runs first and deterministically: one scoped probe per review
 * dimension, so every dimension has evidence even when one topic dominates the
 * document. When nothing relevant is retrieved and the fact store is empty, the
 * call fails fast with a gap and no model call. Otherwise the model sees only
 * the retrieved passages (plus read-only fact-store lookups) and must cite
 * everything; the brief's numbers are then verified against the passages and
 * tool rows.
 */
@Injectable()
export class AnalysisDraftService {
  private readonly logger = new Logger(AnalysisDraftService.name);

  constructor(private readonly agent: AgentService) {}

  async generate(input: AnalysisDraftInput): Promise<AnalysisDraftResult> {
    const queries = BRIEF_DIMENSIONS.map((dimension) =>
      [DIMENSION_QUERIES[dimension], input.focus?.trim()].filter(Boolean).join(" "),
    );

    let hits: RagHit[];
    try {
      const batches = await Promise.all(
        queries.map((query) => retrieve(query, DIMENSION_TOP_K, input.sources)),
      );
      hits = dedupeHits(batches).slice(0, MAX_PASSAGES);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return emptyResult(`Retrieval unavailable: ${message}`);
    }

    let factStoreAvailable = false;
    try {
      factStoreAvailable = await hasFactTables();
    } catch (error) {
      this.logger.warn(
        `Fact store check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (hits.length === 0 && !factStoreAvailable) {
      return emptyResult(
        "The indexed sources could not find any passage covering the selected documents.",
      );
    }

    // Confidence-driven escalation, matching the media desk: a brief built only
    // on weak matches goes to a human as a gap instead of reaching a comms draft.
    const recorded = hits
      .map((hit) => hit.similarity)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (recorded.length > 0) {
      const best = Math.max(...recorded);
      if (best < input.confidenceMin) {
        return emptyResult(
          `Retrieval confidence ${best.toFixed(2)} is below the escalation threshold ${input.confidenceMin.toFixed(2)}.`,
        );
      }
    }

    const { text, model, error, groundTruth } = await this.agent.complete({
      system: ANALYSIS_SYSTEM_PROMPT,
      user: buildUserPrompt(input.sources, input.focus, formatHits(hits), factStoreAvailable),
      feature: "analysis_brief",
      tools: ANALYSIS_TOOLS,
    });

    if (error) {
      this.logger.warn(`Brief generation failed: ${error}`);
      return emptyResult(`Analysis generation unavailable: ${error}`, model);
    }

    if (!text) {
      return emptyResult("The assistant returned an empty brief.", model);
    }

    if (text.startsWith(GAP_PREFIX)) {
      const reason = text.slice(GAP_PREFIX.length).trim();
      return emptyResult(
        reason || "The selected documents do not support a communications brief.",
        model,
      );
    }

    const content = parseBriefContent(text);
    if (!content) {
      return emptyResult("The assistant returned an unstructured brief. Try again.", model);
    }

    const { chunkIds, tables } = briefCitations(content);
    const citedIds = new Set(chunkIds);
    const citedHits = hits.filter((hit) => citedIds.has(hit.chunkId));
    const citedSources = [...citedHits.map(toSource), ...tables.map(toFactSource)];
    const references = citedSources.length > 0 ? citedSources : hits.map(toSource);

    const pool = new Set<string>(groundTruth);
    for (const hit of hits) {
      for (const number of extractNumbers(hit.text)) pool.add(number);
    }
    const verification = verifyNumbers(briefText(content), pool);

    return { content, references, verification, model, gap: null };
  }
}

function emptyResult(gap: string, model: string | null = null): AnalysisDraftResult {
  return {
    content: null,
    references: [],
    verification: { status: "skipped", unverified: [] },
    model,
    gap,
  };
}
