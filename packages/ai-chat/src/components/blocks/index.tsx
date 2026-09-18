import type { UiBlock } from "@voltedge/agent-contract";
import { ChartBlock } from "./chart-block";
import { DocumentBlock } from "./document-block";
import { SourcesBlock } from "./sources-block";
import { TableBlock } from "./table-block";

export { ChartBlock, DocumentBlock, SourcesBlock, TableBlock };

export function UiBlockView({
  block,
  onOpenDocument,
}: {
  block: UiBlock;
  onOpenDocument?: (source: string) => void;
}) {
  switch (block.component) {
    case "table":
      return <TableBlock block={block} />;
    case "chart":
      return <ChartBlock block={block} />;
    case "sources":
      return <SourcesBlock block={block} onOpenDocument={onOpenDocument} />;
    case "document":
      return <DocumentBlock block={block} onOpenDocument={onOpenDocument} />;
    default:
      return null;
  }
}
