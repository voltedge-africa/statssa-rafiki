import type { MediaRequestEventView } from "@voltedge/media-contract";
import { Badge, cn } from "@voltedge/ui";

import { formatDateTime } from "../format.ts";
import { StatusBadge } from "./status-badge.tsx";

const DOT_TONES: Record<MediaRequestEventView["kind"], string> = {
  submitted: "bg-muted-foreground/50",
  status_changed: "bg-primary",
  assigned: "bg-amber-500",
  draft_generated: "bg-muted-foreground/50",
  approved: "bg-brand",
  rejected: "bg-destructive",
  note: "bg-primary",
};

function eventTitle(event: MediaRequestEventView): string {
  switch (event.kind) {
    case "submitted":
      return "Request received";
    case "status_changed":
      return "Status updated";
    case "assigned":
      return "Reviewer assignment";
    case "draft_generated":
      return "Draft generated";
    case "approved":
      return "Response approved";
    case "rejected":
      return "Request declined";
    case "note":
      return "Message";
  }
}

export function RequestTimeline({ events }: { events: MediaRequestEventView[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="flex flex-col">
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < events.length - 1 ? (
            <span aria-hidden="true" className="absolute top-4 left-[5px] h-full w-px bg-border" />
          ) : null}

          <span
            aria-hidden="true"
            className={cn(
              "relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-background",
              DOT_TONES[event.kind],
            )}
          />

          <div className="flex flex-1 flex-col gap-1.5 rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {eventTitle(event)}
                {event.kind === "status_changed" && event.toStatus ? (
                  <StatusBadge status={event.toStatus} />
                ) : null}
                {event.visibility === "internal" ? (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] tracking-wide uppercase"
                  >
                    internal
                  </Badge>
                ) : null}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {formatDateTime(event.createdAt)}
              </span>
            </div>
            {event.message ? (
              <p className="max-w-[64ch] text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {event.message}
              </p>
            ) : null}
            <span className="font-mono text-[11px] text-muted-foreground">{event.actorLabel}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
