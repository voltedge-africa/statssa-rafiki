import { useMemo, type ComponentProps } from "react";
import { CitationChip } from "@voltedge/ui";
import { parseCitationHref } from "../lib/citations.ts";
import type { Components, ExtraProps } from "streamdown";

type AnchorProps = ComponentProps<"a"> & ExtraProps;

/**
 * The anchor renderer shared by every markdown surface: a `[source#chunk]` link becomes
 * a citation chip, and anything else stays a normal link.
 */
export function useMarkdownComponents(onOpenDocument?: (source: string) => void): Components {
  return useMemo<Components>(
    () => ({
      a: ({ href, children: label }: AnchorProps) => {
        const citation = href ? parseCitationHref(href) : null;
        if (citation) {
          return (
            <CitationChip
              label={label}
              title={`Open ${citation.source}`}
              onClick={onOpenDocument ? () => onOpenDocument(citation.source) : undefined}
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
}
