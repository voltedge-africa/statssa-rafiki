import { Spinner } from "@voltedge/ui";

import { useSession } from "../lib/session.tsx";
import { FeedView } from "./feed-view.tsx";
import { HomeView } from "./home-view.tsx";

/**
 * The media room's landing page: signed-in users land on the responses feed with
 * their own inquiries in the sidebar; signed-out visitors get the marketing page.
 */
export function LandingView() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return session ? <FeedView /> : <HomeView />;
}
