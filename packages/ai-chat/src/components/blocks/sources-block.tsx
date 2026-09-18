import { BookIcon } from "lucide-react";
import { Sources, SourcesContent, SourcesTrigger } from "../ai-elements/sources.tsx";
import type { UiBlock } from "@voltedge/agent-contract";

type SourcesBlockType = Extract<UiBlock, { component: "sources" }>;

export function SourcesBlock({
  block,
  onOpenDocument,
}: {
  block: SourcesBlockType;
  onOpenDocument?: (source: string) => void;
}) {
  if (block.items.length === 0) return null;

  return (
    <Sources className="my-3">
      <SourcesTrigger count={block.items.length} />
      <SourcesContent className="w-full">
        {block.items.map((item) => (
          <button
            key={`${item.source}#${item.chunkId}`}
            type="button"
            onClick={() => onOpenDocument?.(item.source)}
            className="flex w-full items-start gap-2 rounded-md border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent"
          >
            <BookIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-mono text-[11px] text-foreground">
                [{item.source}#{item.chunkId}]
                {item.score !== undefined && (
                  <span className="ml-2 text-muted-foreground">sim {item.score.toFixed(2)}</span>
                )}
              </span>
              {item.title && (
                <span className="truncate text-[11px] text-muted-foreground">{item.title}</span>
              )}
              <span className="line-clamp-2 text-[11px] text-muted-foreground">{item.snippet}</span>
            </span>
          </button>
        ))}
      </SourcesContent>
    </Sources>
  );
}
