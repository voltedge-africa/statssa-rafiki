import { POPIA_REQUEST_STATUS_LABELS, type PopiaRequestEventView } from "@voltedge/popia-contract";
import { Badge } from "@voltedge/ui";

import { formatDateTime } from "../format.ts";

function eventTitle(event: PopiaRequestEventView): string {
  switch (event.kind) {
    case "submitted":
      return "Request received";
    case "status_changed":
      return event.toStatus
        ? `Status changed to ${POPIA_REQUEST_STATUS_LABELS[event.toStatus]}`
        : "Status updated";
    case "assigned":
      return "Case assignment";
    case "resolution":
      return "Resolution";
    case "note":
      return "Message";
  }
}

export function RequestTimeline({ events }: { events: PopiaRequestEventView[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="flex flex-col">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex flex-col gap-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              {eventTitle(event)}
              {event.visibility === "internal" ? (
                <Badge variant="outline" className="font-mono text-[10px] tracking-wide uppercase">
                  internal
                </Badge>
              ) : null}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatDateTime(event.createdAt)}
            </span>
          </div>
          {event.message ? (
            <p className="max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
              {event.message}
            </p>
          ) : null}
          <span className="font-mono text-[11px] text-muted-foreground">{event.actorLabel}</span>
        </li>
      ))}
    </ol>
  );
}
