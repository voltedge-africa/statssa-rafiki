import { useEffect, useState } from "react";

import { POPIA_REQUEST_TYPE_LABELS, type PopiaRequestTracking } from "@voltedge/popia-contract";
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
  cn,
} from "@voltedge/ui";

import {
  ApiError,
  RequestFile,
  StatusBadge,
  duePhrase,
  formatDate,
  listMyRequests,
} from "@voltedge/popia-ui";

import { signInUrl, useSession } from "../../lib/session.tsx";

export function MyRequestsView() {
  const { session, loading } = useSession();
  const [requests, setRequests] = useState<PopiaRequestTracking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void listMyRequests()
      .then((result) => {
        if (!cancelled) setRequests(result.requests);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Could not load your requests.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!session) {
    return (
      <section className="grid min-h-[60vh] place-items-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign in to see your requests</CardTitle>
            <CardDescription>
              Requests you submit while signed in are listed here. Anonymous requests can still be
              tracked with the reference and email.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button nativeButton={false} render={<a href={signInUrl} />}>
              Sign in
            </Button>
            <Button variant="ghost" nativeButton={false} render={<a href="/popia/track" />}>
              Track with a reference
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-8 px-6 py-12 sm:px-10 lg:py-16">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs text-muted-foreground">my requests</span>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Requests linked to your account.
        </h1>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load your requests</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {requests === null && !error ? (
        <div className="grid place-items-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : null}

      {requests?.length === 0 ? (
        <div className="grid place-items-center border border-dashed border-border px-6 py-20 text-center">
          <div className="flex max-w-sm flex-col items-center gap-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              You have no requests yet. Submit one and it will appear here.
            </p>
            <Button variant="outline" nativeButton={false} render={<a href="/popia" />}>
              Submit a request
            </Button>
          </div>
        </div>
      ) : null}

      {requests?.length ? (
        <div className="flex flex-col gap-3">
          {requests.map((request) => {
            const expanded = open === request.reference;
            return (
              <div key={request.reference} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : request.reference)}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-left transition-colors",
                    expanded ? "border-border bg-secondary" : "border-border hover:bg-muted",
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      {request.reference}
                    </span>
                    <span className="text-sm font-medium">
                      {POPIA_REQUEST_TYPE_LABELS[request.type]}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      submitted {formatDate(request.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {duePhrase(request.dueAt, request.status)}
                    </span>
                    <StatusBadge status={request.status} />
                  </div>
                </button>
                {expanded ? (
                  <div className="border border-t-0 border-border">
                    <RequestFile request={request} events={request.events} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
