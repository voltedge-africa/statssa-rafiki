import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { isOpenStatus, type MediaRequestTracking } from "@voltedge/media-contract";
import { Alert, AlertDescription, AlertTitle, Button, Spinner } from "@voltedge/ui";
import {
  ApiError,
  DocumentPreview,
  RequestFile,
  getMyMediaRequest,
  withdrawMediaRequest,
} from "@voltedge/media-ui";

import { useSession } from "../lib/session.tsx";

function isActive(request: MediaRequestTracking): boolean {
  return request.status === "submitted" || request.status === "analysing";
}

export function RequestDetailView({ reference }: { reference: string }) {
  const { session } = useSession();
  const [request, setRequest] = useState<MediaRequestTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getMyMediaRequest(reference);
      setRequest(result.request);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? "No request matches this reference on your account."
          : caught instanceof ApiError
            ? caught.message
            : "Could not load the request.",
      );
    }
  }, [reference]);

  useEffect(() => {
    if (!session) return;
    void load();
  }, [session, load]);

  useEffect(() => {
    if (!request || !isActive(request)) return;
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [request, load]);

  async function handleWithdraw() {
    if (!request) return;
    if (!window.confirm("Withdraw this request? Stats SA will stop working on it.")) return;
    setBusy(true);
    setActionError(null);
    try {
      await withdrawMediaRequest(request.reference);
      await load();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : "Could not withdraw the request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="ghost" size="sm" nativeButton={false} render={<a href="/requests" />}>
          <ArrowLeft />
          All requests
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void load()}
          aria-label="Refresh request"
        >
          <RefreshCw />
          Refresh
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not open the request</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {!request && !error ? (
        <div className="grid place-items-center py-20">
          <Spinner className="size-5" />
        </div>
      ) : null}

      {request ? (
        <>
          {request.status === "submitted" || request.status === "analysing" ? (
            <Alert>
              <AlertTitle>Analysing approved sources</AlertTitle>
              <AlertDescription>
                We are searching Stats SA publications and preparing a cited draft. A communications
                official will review it before any response reaches you.
              </AlertDescription>
            </Alert>
          ) : null}

          {request.status === "information_gap" ? (
            <Alert>
              <AlertTitle>Information gap flagged</AlertTitle>
              <AlertDescription>
                Approved sources did not cover this query, so no AI answer was generated. A
                communications official will follow up with you.
              </AlertDescription>
            </Alert>
          ) : null}

          {request.status === "awaiting_review" ? (
            <Alert>
              <AlertTitle>With a communications official</AlertTitle>
              <AlertDescription>
                The draft response is being reviewed and edited. It will appear here once approved.
              </AlertDescription>
            </Alert>
          ) : null}

          <RequestFile request={request} events={request.events} onOpenSource={setPreviewSource} />

          {isOpenStatus(request.status) ? (
            <div className="flex justify-end">
              <Button variant="ghost" disabled={busy} onClick={() => void handleWithdraw()}>
                Withdraw request
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <DocumentPreview
        source={previewSource}
        open={previewSource !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewSource(null);
        }}
      />
    </section>
  );
}
