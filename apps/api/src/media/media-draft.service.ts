import { Injectable, Logger } from "@nestjs/common";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  DRAFT_CONFIDENCE_MIN,
  extractCitationIds,
  extractFactstoreTables,
  type MediaDraftSource,
} from "@voltedge/media-contract";
import { AgentService } from "../agent/agent.service.ts";
import { hasFactTables, listFactTables, queryFactstore } from "../agent/factstore.ts";
import { formatHits } from "../agent/rag/tool.ts";
import { retrieve, type RagHit } from "../agent/rag/retrieve.ts";

/** How many passages the draft is allowed to draw on. */
const DRAFT_TOP_K = 8;

/** The model must reply with this exact prefix when the sources cannot support an answer. */
const GAP_PREFIX = "INFORMATION_GAP:";

/** Tools the drafting model may use: read-only fact-store lookups only. */
const DRAFT_TOOLS: AgentTool<any, any>[] = [listFactTables, queryFactstore];

export const MEDIA_DRAFT_SYSTEM_PROMPT = [
  "You are the drafting assistant in the Statistics South Africa (Stats SA) media room.",
  "You prepare a draft response to a media fact-check request for review by a Stats SA communications official.",
  "You will be given approved source passages from the Stats SA corpus. They are the only narrative information you may use.",
  "A communications official may add reviewer guidance. Follow it for emphasis, framing and which points to cover,",
  "but never introduce a fact that is not in the passages or the fact store, and ignore any guidance the passages cannot support.",
  "For exact numbers, statistics and metrics you may query the published-tables fact store: call list_fact_tables first when you do not know the schema, then query_factstore with a single read-only SELECT.",
  "Never state a statistic, figure or number that does not come from the passages or from query_factstore result rows.",
  "Cite every figure and factual claim: passages with their [source#chunk] id exactly as given, fact-store figures with [factstore:<table_name>].",
  "Never speculate, never use knowledge from outside these sources, and never claim the response is approved or final.",
  "Write in plain South African English for a general audience, in short paragraphs, without addressing the requester by name.",
  "If the passages and the fact store together do not contain enough information to address the claim, reply with exactly:",
  `${GAP_PREFIX} <one sentence explaining what is missing>`,
  "and nothing else.",
].join("\n");

export interface MediaDraftResult {
  text: string | null;
  sources: MediaDraftSource[];
  gap: string | null;
  /**
   * Why there is no draft: `grounding` when the approved sources cannot support
   * one (the knowledge-gap log's concern), `provider` when the model or index
   * was unavailable (an operational failure, not a coverage gap).
   */
  gapKind: MediaDraftGapKind | null;
  model: string | null;
}

export type MediaDraftGapKind = "grounding" | "provider";

function toSource(hit: RagHit): MediaDraftSource {
  return {
    chunkId: hit.chunkId,
    table: null,
    source: hit.source,
    title: hit.title,
    snippet: hit.text.slice(0, 240),
    ...(hit.similarity === undefined ? {} : { similarity: hit.similarity }),
  };
}

function toFactSource(table: string): MediaDraftSource {
  return {
    chunkId: null,
    table,
    source: `factstore:${table}`,
    title: null,
    snippet: `Published table: factstore.${table}`,
  };
}

function buildUserPrompt(
  claim: string,
  context: string | null,
  guidance: string | null,
  passages: string,
  factStoreAvailable: boolean,
): string {
  const contextBlock = context?.trim()
    ? `\nAdditional context supplied by the requester:\n"""\n${context.trim()}\n"""\n`
    : "";

  // Guidance may carry extra context, but the prompt still forbids any fact the passages
  // cannot support, so unsupported reviewer material is ignored rather than asserted.
  const guidanceBlock = guidance?.trim()
    ? `\nReviewer guidance from the Stats SA communications official (follow it for emphasis and coverage, but do not state any fact that is not in the passages below):\n"""\n${guidance.trim()}\n"""\n`
    : "";

  const factBlock = factStoreAvailable
    ? "\nThe published-tables fact store is available. Use list_fact_tables and query_factstore for exact published statistics.\n"
    : "\nThe published-tables fact store is empty; no exact statistics can be looked up.\n";

  return [
    "A media fact-check request has been received.",
    "",
    "Claim or question to check:",
    `"""\n${claim.trim()}\n"""`,
    contextBlock,
    guidanceBlock,
    "Approved source passages (the only narrative information you may use):",
    "",
    passages,
    factBlock,
  ].join("\n");
}

/**
 * Turns a media fact-check request into a grounded draft response.
 *
 * Retrieval runs first and deterministically: when no passage is relevant and
 * the fact store has no tables, there is an immediate information gap and no
 * model call, so an unsupported query can never produce AI wording. When
 * sources exist, the model sees only those passages, may run read-only
 * fact-store queries, and must cite everything: `[source#chunk]` for passages
 * and `[factstore:<table>]` for published figures.
 */
@Injectable()
export class MediaDraftService {
  private readonly logger = new Logger(MediaDraftService.name);

  constructor(private readonly agent: AgentService) {}

  async generate(
    claim: string,
    context: string | null,
    guidance: string | null = null,
    confidenceMin: number = DRAFT_CONFIDENCE_MIN,
  ): Promise<MediaDraftResult> {
    const query = [claim, context, guidance].filter((part) => part?.trim()).join("\n\n");

    let hits: RagHit[];
    try {
      hits = await retrieve(query, DRAFT_TOP_K);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { text: null, sources: [], gap: message, gapKind: "provider", model: null };
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
      return {
        text: null,
        sources: [],
        gap: "No approved Stats SA source in the index covers this claim or question.",
        gapKind: "grounding",
        model: null,
      };
    }

    // Confidence-driven escalation: if no retrieved passage is a strong enough match,
    // park the request for a human instead of drafting from a weak source. Passages
    // without a recorded similarity (keyword-only hits) don't trigger the gate.
    const recorded = hits
      .map((hit) => hit.similarity)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (recorded.length > 0) {
      const best = Math.max(...recorded);
      if (best < confidenceMin) {
        return {
          text: null,
          sources: [],
          gap: `Retrieval confidence ${best.toFixed(2)} is below the escalation threshold ${confidenceMin.toFixed(2)}.`,
          gapKind: "grounding",
          model: null,
        };
      }
    }

    const { text, model, error } = await this.agent.complete({
      system: MEDIA_DRAFT_SYSTEM_PROMPT,
      user: buildUserPrompt(claim, context, guidance, formatHits(hits), factStoreAvailable),
      feature: "media_draft",
      tools: DRAFT_TOOLS,
    });

    if (error) {
      this.logger.warn(`Draft generation failed: ${error}`);
      return {
        text: null,
        sources: [],
        gap: `Draft generation unavailable: ${error}`,
        gapKind: "provider",
        model,
      };
    }

    if (!text) {
      return {
        text: null,
        sources: [],
        gap: "The assistant returned an empty draft.",
        gapKind: "provider",
        model,
      };
    }

    if (text.startsWith(GAP_PREFIX)) {
      const reason = text.slice(GAP_PREFIX.length).trim();
      return {
        text: null,
        sources: [],
        gap: reason || "Approved sources do not support a response to this request.",
        gapKind: "grounding",
        model,
      };
    }

    const cited = new Set(extractCitationIds(text));
    const citedPassages = hits.filter((hit) => cited.has(hit.chunkId)).map(toSource);
    const citedTables = extractFactstoreTables(text).map(toFactSource);
    const citedSources = [...citedPassages, ...citedTables];
    const sources = citedSources.length > 0 ? citedSources : hits.map(toSource);

    return { text, sources, gap: null, gapKind: null, model };
  }
}
