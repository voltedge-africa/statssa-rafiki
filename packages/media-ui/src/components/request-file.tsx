import { PlainMarkdown } from "@voltedge/ai-chat/components/plain-markdown";
import type {
  MediaAiDraft,
  MediaRequestEventView,
  MediaRequestPublic,
} from "@voltedge/media-contract";
import { Badge } from "@voltedge/ui";

import { formatDate } from "../format.ts";
import { DraftCard } from "./draft-card.tsx";
import { Fact } from "./fact.tsx";
import { SourceReferences } from "./references.tsx";
import { StatusBadge } from "./status-badge.tsx";
import { RequestTimeline } from "./timeline.tsx";

export type RequestFileProps = {
  request: MediaRequestPublic;
  events?: MediaRequestEventView[];
  /** Reviewer extras: requester contact, assignment and the AI draft. */
  email?: string | null;
  assignedToEmail?: string | null;
  draft?: MediaAiDraft | null;
  /** When set, every citation chip opens its source through this handler. */
  onOpenSource?: (source: string) => void;
};

export function RequestFile({
  request,
  events,
  email,
  assignedToEmail,
  draft,
  onOpenSource,
}: RequestFileProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">{request.reference}</span>
          <span className="font-heading text-base font-medium">Media fact-check request</span>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <dl className="grid gap-px border-b border-border bg-border sm:grid-cols-3">
        <Fact label="submitted" value={formatDate(request.createdAt)} />
        <Fact label="deadline" value={formatDate(request.deadline)} />
        <Fact label="last update" value={formatDate(request.updatedAt)} />
      </dl>

      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">requested by</span>
          <p className="text-sm font-medium">{request.requesterName}</p>
          {request.outlet ? (
            <p className="text-sm text-muted-foreground">{request.outlet}</p>
          ) : null}
          {email ? <p className="text-sm text-muted-foreground">{email}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">claim or question</span>
          <p className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap">
            {request.claim}
          </p>
        </div>

        {request.context ? (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">context</span>
            <p className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {request.context}
            </p>
          </div>
        ) : null}

        {assignedToEmail ? (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">assigned to</span>
            <p className="text-sm">{assignedToEmail}</p>
          </div>
        ) : null}
      </div>

      {draft ? (
        <div className="border-t border-border px-5 py-5">
          <DraftCard draft={draft} onOpenSource={onOpenSource} />
        </div>
      ) : null}

      {request.approvedResponse ? (
        <div className="flex flex-col gap-4 border-t border-border px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">approved response</span>
            <Badge
              variant="outline"
              className="border-transparent bg-brand/10 font-mono text-[10px] tracking-wide text-brand uppercase"
            >
              reviewed by Stats SA
            </Badge>
          </div>
          <PlainMarkdown
            className="max-w-[68ch] text-sm leading-relaxed"
            onOpenDocument={onOpenSource}
          >
            {request.approvedResponse}
          </PlainMarkdown>
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <span className="font-mono text-[11px] text-muted-foreground">
              references ({request.approvedSources.length})
            </span>
            <SourceReferences sources={request.approvedSources} onOpenSource={onOpenSource} />
          </div>
        </div>
      ) : null}

      {request.rejectedReason ? (
        <div className="flex flex-col gap-1 border-t border-border border-l-2 border-l-destructive px-5 py-5">
          <span className="font-mono text-[11px] text-muted-foreground">reason for declining</span>
          <p className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap">
            {request.rejectedReason}
          </p>
        </div>
      ) : null}

      {events ? (
        <div className="border-t border-border px-5 py-5">
          <span className="font-mono text-[11px] text-muted-foreground">timeline</span>
          <div className="mt-3">
            <RequestTimeline events={events} />
          </div>
        </div>
      ) : null}
    </article>
  );
}
