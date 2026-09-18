import { PlainMarkdown } from "@voltedge/ai-chat/components/plain-markdown";
import type { MediaOfficialResponse } from "@voltedge/media-contract";
import { Badge } from "@voltedge/ui";

import { formatDate } from "../format.ts";
import { SourceReferences } from "./references.tsx";

/**
 * An approved official response as shown in the media-room feed. The requester's
 * identity is deliberately absent — only the claim, the response and its sources.
 */
export function OfficialResponseCard({ response }: { response: MediaOfficialResponse }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">{response.reference}</span>
          <span className="line-clamp-2 max-w-[62ch] font-heading text-base font-medium">
            {response.claim}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-transparent bg-brand/10 font-mono text-[10px] tracking-wide text-brand uppercase"
          >
            official response
          </Badge>
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatDate(response.approvedAt)}
          </span>
        </div>
      </div>

      <div className="px-5 py-5">
        <PlainMarkdown className="max-w-[68ch] text-sm leading-relaxed">
          {response.response}
        </PlainMarkdown>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-5">
        <span className="font-mono text-[11px] text-muted-foreground">
          references ({response.sources.length})
        </span>
        <SourceReferences sources={response.sources} />
      </div>
    </article>
  );
}
