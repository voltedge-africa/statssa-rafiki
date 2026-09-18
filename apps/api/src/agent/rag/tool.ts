import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { sourcesBlock, type SourceItem, type UiBlock } from "../ui/blocks.ts";
import { DEFAULT_TOP_K } from "./config.ts";
import type { RagHit } from "./db.ts";

const SearchParameters = Type.Object({
  query: Type.String({
    description:
      "Natural-language search query. Include exact terms where they matter (series names, place names, years).",
  }),
  k: Type.Optional(
    Type.Number({ description: `Number of passages to return. Default ${DEFAULT_TOP_K}.` }),
  ),
});

export function formatHits(hits: RagHit[]): string {
  return hits
    .map((hit, index) => {
      const title = hit.title ? `${hit.title} — ` : "";
      const citation = `[${hit.source}#${hit.chunkId}]`;
      return `${index + 1}. ${citation} ${title}\n${hit.text}`;
    })
    .join("\n\n---\n\n");
}

function toSourceItems(hits: RagHit[]): SourceItem[] {
  return hits.map((hit) => ({
    chunkId: hit.chunkId,
    source: hit.source,
    title: hit.title,
    snippet: hit.text.slice(0, 240),
    ...(hit.similarity === undefined ? {} : { score: hit.similarity }),
  }));
}

export const searchStatsSa: AgentTool<
  typeof SearchParameters,
  { hits: RagHit[]; block?: UiBlock }
> = {
  name: "search_statssa",
  label: "Search Stats SA corpus",
  description:
    "Hybrid keyword and semantic search over the locally indexed Stats SA corpus. Returns ranked passages with source ids. Use this for any question about published South African statistics, and cite the [source#chunk] ids you rely on.",
  parameters: SearchParameters,
  execute: async (_toolCallId, params) => {
    const k = params.k ?? DEFAULT_TOP_K;
    try {
      const { retrieve } = await import("./retrieve.ts");
      const hits = await retrieve(params.query, k);
      if (hits.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No passages in the local Stats SA index are sufficiently relevant to this query. Tell the user the corpus does not cover it, and do not answer from general knowledge.",
            },
          ],
          details: { hits: [] },
        };
      }
      return {
        content: [{ type: "text", text: formatHits(hits) }],
        details: { hits, block: sourcesBlock(toSourceItems(hits)) },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Retrieval unavailable: ${message}` }],
        details: { hits: [] },
      };
    }
  },
};
