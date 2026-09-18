import { useCallback, useEffect, useState } from "react";

import type { MediaOfficialResponse } from "@voltedge/media-contract";
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
import { ApiError, OfficialResponseCard, listOfficialResponses } from "@voltedge/media-ui";

import { RequestsSidebar } from "../components/requests-sidebar.tsx";
import { useSession } from "../lib/session.tsx";

const FEED_PAGE_SIZE = 25;

export function FeedView() {
  const { session } = useSession();
  const [responses, setResponses] = useState<MediaOfficialResponse[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    listOfficialResponses({ limit: FEED_PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setResponses(result.responses);
        setTotal(result.total);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : "Could not load official responses.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const loadMore = useCallback(async () => {
    if (responses === null) return;
    setLoadingMore(true);
    try {
      const result = await listOfficialResponses({
        limit: FEED_PAGE_SIZE,
        offset: responses.length,
      });
      setResponses([...responses, ...result.responses]);
      setTotal(result.total);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load more responses.");
    } finally {
      setLoadingMore(false);
    }
  }, [responses]);

  return (
    <div className="grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[300px_1fr] lg:px-14">
      <RequestsSidebar />

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Official responses
          </span>
          <h1 className="font-heading text-3xl font-medium">Reviewed answers from Stats SA</h1>
          <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            Every response below was approved by a Stats SA communications official and lists the
            published sources behind its figures. Your own inquiries stay in the sidebar.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load official responses</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : responses === null ? (
          <div className="grid place-items-center py-20">
            <Spinner className="size-5" />
          </div>
        ) : responses.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No official responses yet</CardTitle>
              <CardDescription>
                Approved responses appear here as soon as a Stats SA official releases them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-muted-foreground">
                File a request from the sidebar and it will show up in your inquiries.
              </span>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="flex flex-col gap-5">
              {responses.map((response) => (
                <li key={response.reference}>
                  <OfficialResponseCard response={response} />
                </li>
              ))}
            </ul>

            {responses.length < total ? (
              <Button
                variant="outline"
                className="self-start"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? <Spinner className="size-4" /> : null}
                Load more responses
              </Button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
