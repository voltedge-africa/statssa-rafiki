import type { MediaDraftSource } from "@voltedge/media-contract";

/**
 * The approved sources behind an AI draft or an approved response, rendered as a
 * reference list so a reader can verify each factual claim.
 */
export function SourceReferences({ sources }: { sources: MediaDraftSource[] }) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No source references were recorded for this response.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {sources.map((source) => (
        <li key={`${source.source}#${source.chunkId}`} className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            {source.title ?? source.source}{" "}
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              [{source.source}#{source.chunkId}]
            </span>
          </span>
          <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            {source.snippet}
          </p>
        </li>
      ))}
    </ol>
  );
}
