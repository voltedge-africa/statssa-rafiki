import { useEffect, useState } from "react";

import type { MediaRequestSummary } from "@voltedge/media-contract";
import { ApiError, listMyMediaRequests } from "@voltedge/media-ui";

/** The signed-in user's previous inquiries, debounced by the sidebar search. */
export function useInquiries(query: string): {
  requests: MediaRequestSummary[] | null;
  error: string | null;
} {
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
          setError(caught instanceof ApiError ? caught.message : "Could not load your inquiries.");
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  return { requests, error };
}
