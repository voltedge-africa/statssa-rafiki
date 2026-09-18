import type { MediaDraftSource } from "@voltedge/media-contract";
import { CitationChip } from "@voltedge/ui";

/**
 * The approved sources behind an AI draft or an approved response, rendered as a
 * reference list so a reader can verify each factual claim. Each reference carries the
 * same citation chip used in the public chat answers.
 */
export function SourceReferences({
  sources,
  onOpenSource,
}: {
  sources: MediaDraftSource[];
  onOpenSource?: (source: string) => void;
}) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No source references were recorded for this response.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {sources.map((source) => {
        const isTable = source.table != null;
        const reference = isTable ? source.source : `${source.source}#${source.chunkId}`;
        return (
          <li key={`${reference}:${source.table ?? ""}`} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              {source.title ? <span className="text-sm font-medium">{source.title}</span> : null}
              <CitationChip
                label={reference}
                title={`Open ${source.source}`}
                onClick={onOpenSource ? () => onOpenSource(source.source) : undefined}
              />
            </div>
            <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
              {source.snippet}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
