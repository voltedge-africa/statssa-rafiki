import { useMemo } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { linkifyCitations } from "../lib/citations.ts";
import { useMarkdownComponents } from "./markdown-anchor.tsx";

/**
 * Markdown with citation chips but none of the chat surface's heavy plugins (code
 * highlighting, maths, diagrams). Used where a grounded answer is read rather than
 * streamed, e.g. the media review draft and approved response.
 */
export function PlainMarkdown({
  children,
  onOpenDocument,
  className,
}: {
  children: string;
  onOpenDocument?: (source: string) => void;
  className?: string;
}) {
  const components = useMarkdownComponents(onOpenDocument);
  const content = useMemo(() => linkifyCitations(children), [children]);

  return (
    <Streamdown className={className} components={components}>
      {content}
    </Streamdown>
  );
}
