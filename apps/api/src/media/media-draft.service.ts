import { Injectable, Logger } from "@nestjs/common";
import { extractCitationIds, type MediaDraftSource } from "@voltedge/media-contract";
import { AgentService } from "../agent/agent.service.ts";
import { formatHits } from "../agent/rag/tool.ts";
import { retrieve, type RagHit } from "../agent/rag/retrieve.ts";

/** How many passages the draft is allowed to draw on. */
const DRAFT_TOP_K = 8;

/** The model must reply with this exact prefix when the passages cannot support an answer. */
const GAP_PREFIX = "INFORMATION_GAP:";

export const MEDIA_DRAFT_SYSTEM_PROMPT = [
  "You are the drafting assistant in the Statistics South Africa (Stats SA) media room.",
  "You prepare a draft response to a media fact-check request for review by a Stats SA communications official.",
  "You will be given approved source passages. They are the only information you may use.",
  "A communications official may add reviewer guidance. Follow it for emphasis, framing and which points to cover,",
  "but never introduce a fact that is not in the passages, and ignore any guidance the passages cannot support.",
  "Cite every figure and factual claim with its [source#chunk] id, exactly as it appears in the passages.",
  "Never speculate, never use knowledge from outside the passages, and never claim the response is approved or final.",
  "Write in plain South African English for a general audience, in short paragraphs, without addressing the requester by name.",
  "If the passages do not contain enough information to address the claim, reply with exactly:",
  `${GAP_PREFIX} <one sentence explaining what is missing>`,
  "and nothing else.",
].join("\n");

export interface MediaDraftResult {
  text: string | null;
  sources: MediaDraftSource[];
  gap: string | null;
  model: string | null;
}

function toSource(hit: RagHit): MediaDraftSource {
  return {
    chunkId: hit.chunkId,
    source: hit.source,
    title: hit.title,
    snippet: hit.text.slice(0, 240),
    ...(hit.similarity === undefined ? {} : { similarity: hit.similarity }),
  };
}

function buildUserPrompt(
  claim: string,
  context: string | null,
  guidance: string | null,
  passages: string,
): string {
  const contextBlock = context?.trim()
    ? `\nAdditional context supplied by the requester:\n"""\n${context.trim()}\n"""\n`
    : "";

  // Guidance may carry extra context, but the prompt still forbids any fact the passages
  // cannot support, so unsupported reviewer material is ignored rather than asserted.
  const guidanceBlock = guidance?.trim()
    ? `\nReviewer guidance from the Stats SA communications official (follow it for emphasis and coverage, but do not state any fact that is not in the passages below):\n"""\n${guidance.trim()}\n"""\n`
    : "";

  return [
    "A media fact-check request has been received.",
    "",
    "Claim or question to check:",
    `"""\n${claim.trim()}\n"""`,
    contextBlock,
    guidanceBlock,
    "Approved source passages (the only information you may use):",
    "",
    passages,
  ].join("\n");
}

/**
 * Turns a media fact-check request into a grounded draft response.
 *
 * Retrieval runs first and deterministically: no relevant passage means an
 * immediate information gap and no model call, so an unsupported query can never
 * produce AI wording. When passages exist, the model sees only those passages
 * and must cite them; cited chunk ids are mapped back to source metadata.
 */
@Injectable()
export class MediaDraftService {
  private readonly logger = new Logger(MediaDraftService.name);

  constructor(private readonly agent: AgentService) {}

  async generate(
    claim: string,
    context: string | null,
    guidance: string | null = null,
  ): Promise<MediaDraftResult> {
    const query = [claim, context, guidance].filter((part) => part?.trim()).join("\n\n");

    let hits: RagHit[];
    try {
      hits = await retrieve(query, DRAFT_TOP_K);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { text: null, sources: [], gap: message, model: null };
    }

    if (hits.length === 0) {
      return {
        text: null,
        sources: [],
        gap: "No approved Stats SA source in the index covers this claim or question.",
        model: null,
      };
    }

    const { text, model, error } = await this.agent.complete({
      system: MEDIA_DRAFT_SYSTEM_PROMPT,
      user: buildUserPrompt(claim, context, guidance, formatHits(hits)),
      feature: "media_draft",
    });

    if (error) {
      this.logger.warn(`Draft generation failed: ${error}`);
      return { text: null, sources: [], gap: `Draft generation unavailable: ${error}`, model };
    }

    if (!text) {
      return { text: null, sources: [], gap: "The assistant returned an empty draft.", model };
    }

    if (text.startsWith(GAP_PREFIX)) {
      const reason = text.slice(GAP_PREFIX.length).trim();
      return {
        text: null,
        sources: [],
        gap: reason || "Approved sources do not support a response to this request.",
        model,
      };
    }

    const cited = new Set(extractCitationIds(text));
    const citedSources = hits.filter((hit) => cited.has(hit.chunkId)).map(toSource);
    const sources = citedSources.length > 0 ? citedSources : hits.map(toSource);

    return { text, sources, gap: null, model };
  }
}
