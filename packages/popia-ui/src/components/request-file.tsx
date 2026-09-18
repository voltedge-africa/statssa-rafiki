import {
  POPIA_REQUEST_TYPE_LABELS,
  type PopiaRequestEventView,
  type PopiaRequestPublic,
} from "@voltedge/popia-contract";

import { formatDate } from "../format.ts";
import { Fact } from "./fact.tsx";
import { StatusBadge } from "./status-badge.tsx";
import { RequestTimeline } from "./timeline.tsx";

export type RequestFileProps = {
  request: PopiaRequestPublic;
  events?: PopiaRequestEventView[];
  /** Case-worker extras: contact details and the current assignee. */
  email?: string | null;
  phone?: string | null;
  assignedToEmail?: string | null;
};

export function RequestFile({ request, events, email, phone, assignedToEmail }: RequestFileProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">{request.reference}</span>
          <span className="font-heading text-base font-medium">
            {POPIA_REQUEST_TYPE_LABELS[request.type]}
          </span>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <dl className="grid gap-px border-b border-border bg-border sm:grid-cols-3">
        <Fact label="submitted" value={formatDate(request.createdAt)} />
        <Fact label="response due" value={formatDate(request.dueAt)} />
        <Fact label="last update" value={formatDate(request.updatedAt)} />
      </dl>

      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">requested by</span>
          <p className="text-sm font-medium">{request.requesterName}</p>
          {email ? <p className="text-sm text-muted-foreground">{email}</p> : null}
          {phone ? <p className="text-sm text-muted-foreground">{phone}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">request</span>
          <p className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap">
            {request.details}
          </p>
        </div>

        {request.desiredOutcome ? (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">desired outcome</span>
            <p className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap">
              {request.desiredOutcome}
            </p>
          </div>
        ) : null}

        {request.resolution ? (
          <div className="flex flex-col gap-1 border-l-2 border-brand pl-3">
            <span className="font-mono text-[11px] text-muted-foreground">resolution</span>
            <p className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap">
              {request.resolution}
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
