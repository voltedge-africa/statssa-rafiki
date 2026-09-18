import { useEffect, useState } from "react";
import { FileTextIcon } from "lucide-react";
import { MessageResponse } from "./ai-elements/message.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from "@voltedge/ui";
import type { IndexedDocument } from "@voltedge/agent-contract";

export function DocumentPreview({
  source,
  open,
  onOpenChange,
  apiBase = "",
}: {
  source: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Base URL of the agent API. Empty string targets the current origin. */
  apiBase?: string;
}) {
  const [document, setDocument] = useState<IndexedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !source) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDocument(null);

    fetch(`${apiBase}/api/rag/document?source=${encodeURIComponent(source)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
        return body as unknown as IndexedDocument;
      })
      .then((loaded) => {
        if (!cancelled) setDocument(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, source, apiBase]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="flex-row items-start gap-3 border-b px-5 py-4 pr-12">
          <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="truncate text-base">
              {document?.title ?? source ?? "Document"}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs">
              <span className="truncate">{source}</span>
              {document && (
                <span className="text-muted-foreground/70">
                  · {document.text.length.toLocaleString()} chars
                </span>
              )}
            </DialogDescription>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-4 text-sm">
            {loading ? (
              <p className="text-muted-foreground">Loading document…</p>
            ) : error ? (
              <p className="text-destructive">Could not load document: {error}</p>
            ) : document ? (
              <MessageResponse>{document.text}</MessageResponse>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
