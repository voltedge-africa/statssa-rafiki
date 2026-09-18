import { useMemo, type ComponentProps } from "react";
import { FileTextIcon } from "lucide-react";
import { MessageResponse } from "./ai-elements/message.tsx";
import { linkifyCitations, parseCitationHref } from "../lib/citations.ts";
import type { Components, ExtraProps } from "streamdown";

type AnchorProps = ComponentProps<"a"> & ExtraProps;

const CITATION_LABEL_LIMIT = 15;

function truncateLabel(label: React.ReactNode): React.ReactNode {
  if (typeof label !== "string" || label.length <= CITATION_LABEL_LIMIT) return label;
  return `${label.slice(0, CITATION_LABEL_LIMIT)}…`;
}

function CitationChip({
  label,
  title,
  onClick,
}: {
  label: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="mx-0.5 inline-flex max-w-[16rem] cursor-pointer items-center gap-1 truncate rounded-md border border-border bg-muted px-1.5 py-0.5 align-baseline font-mono text-[0.72rem] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
    >
      <FileTextIcon className="size-3 shrink-0" />
      <span className="truncate">{truncateLabel(label)}</span>
    </button>
  );
}

export function Markdown({
  children,
  onOpenDocument,
  isAnimating,
  className,
}: {
  children: string;
  onOpenDocument?: (source: string) => void;
  isAnimating?: boolean;
  className?: string;
}) {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children: label }: AnchorProps) => {
        const citation = href ? parseCitationHref(href) : null;
        if (citation) {
          return (
            <CitationChip
              label={label}
              title={`Open ${citation.source}`}
              onClick={() => onOpenDocument?.(citation.source)}
            />
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-primary"
          >
            {label}
          </a>
        );
      },
    }),
    [onOpenDocument],
  );

  const content = useMemo(() => linkifyCitations(children), [children]);

  return (
    <MessageResponse className={className} isAnimating={isAnimating} components={components}>
      {content}
    </MessageResponse>
  );
}
