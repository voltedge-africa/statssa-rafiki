import { FileTextIcon } from "lucide-react";
import { MessageResponse } from "../ai-elements/message.tsx";
import { Button, Card, CardFooter } from "@voltedge/ui";
import type { UiBlock } from "@voltedge/agent-contract";

type DocumentBlockType = Extract<UiBlock, { component: "document" }>;

export function DocumentBlock({
  block,
  onOpenDocument,
}: {
  block: DocumentBlockType;
  onOpenDocument?: (source: string) => void;
}) {
  return (
    <Card className="my-3 gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{block.title ?? block.source}</span>
        </span>
        <Button variant="outline" size="sm" onClick={() => onOpenDocument?.(block.source)}>
          Open
        </Button>
      </div>
      <div className="relative max-h-64 overflow-hidden">
        <div className="px-4 py-3 text-sm">
          <MessageResponse>{block.text}</MessageResponse>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
      </div>
      <CardFooter className="border-t py-2 font-mono text-[11px] text-muted-foreground">
        {block.source}
      </CardFooter>
    </Card>
  );
}
