import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";

import { isOpenStatus, type MediaRequestSummary } from "@voltedge/media-contract";
import { Alert, AlertDescription, AlertTitle, Button, Input, Spinner } from "@voltedge/ui";
import { ApiError, StatusBadge, listMyMediaRequests } from "@voltedge/media-ui";

/**
 * The media room's left rail: the signed-in requester's previous inquiries with a
 * server-side search and a shortcut to file a new one. Clicking an inquiry opens it.
 */
export function RequestsSidebar() {
  const [query, setQuery] = useState("");
  const [requests, setRequests] = useState<MediaRequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      listMyMediaRequests({ q: query.trim() || undefined, limit: 50 })
        .then((result) => {
          if (cancelled) return;
          setRequests(result.requests);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          setError(caught instanceof ApiError ? caught.message : "Could not load your requests.");
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
      <Button nativeButton={false} render={<a href="/request" />}>
        <Plus />
        New request
      </Button>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your inquiries"
          aria-label="Search your previous inquiries"
          className="pl-9"
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load your inquiries</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : requests === null ? (
        <div className="grid place-items-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : requests.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          {query.trim() ? "No inquiries match that search." : "You have not filed an inquiry yet."}
        </p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-border">
          {requests.map((request) => (
            <li key={request.reference} className="border-t border-border first:border-t-0">
              <a
                href={`/requests/${request.reference}`}
                className="flex flex-col gap-1.5 px-3 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {request.reference}
                  </span>
                  <StatusBadge status={request.status} />
                </span>
                <span className="line-clamp-2 text-sm font-medium">{request.claim}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {isOpenStatus(request.status) ? "open" : "closed"}
                  {request.hasResponse ? " · response" : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <Button variant="ghost" size="sm" nativeButton={false} render={<a href="/requests" />}>
        View all requests
      </Button>
    </aside>
  );
}
