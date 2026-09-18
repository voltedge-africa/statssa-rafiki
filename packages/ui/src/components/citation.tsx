import type { ReactNode } from "react";
import { FileTextIcon } from "lucide-react";

import { cn } from "../lib/utils.ts";

const CITATION_LABEL_LIMIT = 15;

function truncateLabel(label: string): string {
  if (label.length <= CITATION_LABEL_LIMIT) return label;
  return `${label.slice(0, CITATION_LABEL_LIMIT)}…`;
}

export interface CitationChipProps {
  label: ReactNode;
  title: string;
  onClick?: () => void;
  className?: string;
}

/**
 * The reference chip shown wherever a `[source#chunk]` citation appears. Shared by the
 * public chat answers and the media review so a citation looks and behaves the same in
 * both. Renders an inert chip when no `onClick` is supplied.
 */
export function CitationChip({ label, title, onClick, className }: CitationChipProps) {
  const classes = cn(
    "mx-0.5 inline-flex max-w-[16rem] items-center gap-1 truncate rounded-md border border-border bg-muted px-1.5 py-0.5 align-baseline font-mono text-[0.72rem] text-muted-foreground transition-colors",
    onClick
      ? "cursor-pointer hover:border-primary/40 hover:bg-accent hover:text-foreground"
      : undefined,
    className,
  );

  const content = (
    <>
      <FileTextIcon className="size-3 shrink-0" />
      <span className="truncate">{typeof label === "string" ? truncateLabel(label) : label}</span>
    </>
  );

  if (!onClick) {
    return (
      <span title={title} className={classes}>
        {content}
      </span>
    );
  }

  return (
    <button type="button" title={title} onClick={onClick} className={classes}>
      {content}
    </button>
  );
}
