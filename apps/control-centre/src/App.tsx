import { useEffect } from "react";

import { SidebarInset, SidebarProvider, SidebarTrigger, Spinner } from "@voltedge/ui";

import { AppSidebar } from "./components/app-sidebar.tsx";
import { mediaPortalUrl, websiteUrl } from "./lib/env.ts";
import { caseReferenceFromPath, mediaReferenceFromPath, usePath } from "./lib/router.ts";
import { useSession } from "./lib/session.tsx";
import { CaseQueueView } from "./views/case-queue-view.tsx";
import { CaseRequestView } from "./views/case-request-view.tsx";
import { MediaQueueView } from "./views/media-queue-view.tsx";
import { MediaRequestView } from "./views/media-request-view.tsx";

function Redirecting() {
  return (
    <div className="grid min-h-svh place-items-center">
      <Spinner className="size-6" />
    </div>
  );
}

export function App() {
  const path = usePath();
  const { session, loading } = useSession();

  // The server redirects too; this covers a session that expires or changes while the app is open.
  useEffect(() => {
    if (loading) return;
    if (!session) {
      window.location.replace(websiteUrl());
      return;
    }
    if (session.role === "Press") {
      window.location.replace(mediaPortalUrl());
    }
  }, [loading, session]);

  if (loading || !session || session.role === "Press") {
    return <Redirecting />;
  }

  const mediaReference = mediaReferenceFromPath(path);
  const caseReference = caseReferenceFromPath(path);
  const onMediaDesk = path === "/media" || mediaReference !== null;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex flex-col">
            <span className="font-heading text-sm font-medium">
              {onMediaDesk ? "Media desk" : "POPIA case queue"}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {mediaReference ??
                caseReference ??
                (onMediaDesk ? "media fact-check review" : "staff & admin workspace")}
            </span>
          </div>
        </header>

        <div className="flex flex-1 flex-col p-4 md:p-6">
          {mediaReference ? (
            <MediaRequestView reference={mediaReference} />
          ) : onMediaDesk ? (
            <MediaQueueView />
          ) : caseReference ? (
            <CaseRequestView reference={caseReference} />
          ) : (
            <CaseQueueView />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
