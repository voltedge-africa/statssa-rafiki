import { useEffect } from "react";

import { SidebarInset, SidebarProvider, SidebarTrigger, Spinner } from "@voltedge/ui";

import { AppSidebar } from "./components/app-sidebar.tsx";
import { controlCentreUrl, websiteUrl } from "./env.ts";
import { referenceFromPath, usePath } from "./lib/router.ts";
import { useSession } from "./lib/session.tsx";
import { FeedView } from "./views/feed-view.tsx";
import { MyRequestsView } from "./views/my-requests-view.tsx";
import { NotFoundView } from "./views/not-found-view.tsx";
import { RequestDetailView } from "./views/request-detail-view.tsx";
import { RequestView } from "./views/request-view.tsx";

function headingFor(path: string, reference: string | null): { title: string; subtitle: string } {
  if (reference) return { title: "Request detail", subtitle: reference };
  if (path === "/request") return { title: "File a request", subtitle: "new fact-check request" };
  if (path === "/requests") return { title: "My requests", subtitle: "everything you have filed" };
  return { title: "Official responses", subtitle: "approved answers from Stats SA" };
}

function Redirecting() {
  return (
    <div className="grid min-h-svh place-items-center">
      <Spinner className="size-6" />
    </div>
  );
}

export function App() {
  const path = usePath();
  const reference = referenceFromPath(path);
  const { session, loading } = useSession();

  // The server redirects too; this covers a session that expires or changes while the app is open.
  useEffect(() => {
    if (loading) return;
    if (!session) {
      window.location.replace(websiteUrl());
      return;
    }
    if (session.role !== "Press") {
      window.location.replace(controlCentreUrl());
    }
  }, [loading, session]);

  if (loading || !session || session.role !== "Press") {
    return <Redirecting />;
  }

  const heading = headingFor(path, reference);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex flex-col">
            <span className="font-heading text-sm font-medium">{heading.title}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{heading.subtitle}</span>
          </div>
        </header>

        <div className="flex flex-1 flex-col p-4 md:p-6">
          {path === "/" || path === "/feed" ? (
            <FeedView />
          ) : path === "/request" ? (
            <RequestView />
          ) : path === "/requests" ? (
            <MyRequestsView />
          ) : reference ? (
            <RequestDetailView reference={reference} />
          ) : (
            <NotFoundView />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
