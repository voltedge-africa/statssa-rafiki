import { useCallback, useEffect, useState } from "react";

import { isOpenStatus, type MediaRequestSummary } from "@voltedge/media-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@voltedge/ui";
import { ApiError, StatusBadge, deadlinePhrase, listMyMediaRequests } from "@voltedge/media-ui";

import { SignInGate } from "../components/sign-in-gate.tsx";
import { useSession } from "../lib/session.tsx";

function isActive(request: MediaRequestSummary): boolean {
  return request.status === "submitted" || request.status === "analysing";
}

export function MyRequestsView() {
  const { session, loading } = useSession();
  const [requests, setRequests] = useState<MediaRequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listMyMediaRequests();
      setRequests(result.requests);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load your requests.");
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load();
  }, [session, load]);

  const active = requests?.some(isActive) ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [active, load]);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!session) {
    return (
      <SignInGate
        title="Sign in to see your requests"
        description="Your fact-check requests and their approved responses are linked to your account."
      />
    );
  }

  const open = (requests ?? []).filter((request) => isOpenStatus(request.status));
  const closed = (requests ?? []).filter((request) => !isOpenStatus(request.status));

  return (
    <section className="flex flex-col gap-8 px-6 py-14 sm:px-10 lg:px-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            My requests
          </span>
          <h1 className="font-heading text-3xl font-medium">Your fact-check requests</h1>
          <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            Open requests update as they move through analysis and review. Approved responses stay
            here with their references.
          </p>
        </div>
        <Button nativeButton={false} render={<a href="/request" />}>
          New request
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load your requests</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {requests === null && !error ? (
        <div className="grid place-items-center py-20">
          <Spinner className="size-5" />
        </div>
      ) : (requests ?? []).length === 0 && !error ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No requests yet</CardTitle>
            <CardDescription>
              File your first fact-check request and track the response here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button nativeButton={false} render={<a href="/request" />}>
              File a request
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {open.length > 0 ? (
            <div className="flex flex-col gap-3">
              <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                Open
              </span>
              <RequestList requests={open} />
            </div>
          ) : null}

          {closed.length > 0 ? (
            <div className="flex flex-col gap-3">
              <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                Closed
              </span>
              <RequestList requests={closed} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function RequestList({ requests }: { requests: MediaRequestSummary[] }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-border">
      {requests.map((request) => (
        <li key={request.reference} className="border-t border-border first:border-t-0">
          <a
            href={`/requests/${request.reference}`}
            className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-muted/50"
          >
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {request.reference}
              </span>
              <StatusBadge status={request.status} />
            </span>
            <span className="line-clamp-2 max-w-[80ch] text-sm font-medium">{request.claim}</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <span>{deadlinePhrase(request.deadline, request.status)}</span>
              {request.hasResponse ? <span>response available</span> : null}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
