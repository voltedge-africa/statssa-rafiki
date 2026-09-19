import { useEffect } from "react";

import { SidebarInset, SidebarProvider, SidebarTrigger, Spinner } from "@voltedge/ui";

import { AppSidebar } from "./components/app-sidebar.tsx";
import { mediaPortalUrl, websiteUrl } from "./lib/env.ts";
import {
  briefIdFromPath,
  caseReferenceFromPath,
  mediaReferenceFromPath,
  usePath,
} from "./lib/router.ts";
import { useSession } from "./lib/session.tsx";
import { AiTelemetryView } from "./views/ai-telemetry-view.tsx";
import { AnalysisBriefView } from "./views/analysis-brief-view.tsx";
import { AnalysisView } from "./views/analysis-view.tsx";
import { CaseQueueView } from "./views/case-queue-view.tsx";
import { CaseRequestView } from "./views/case-request-view.tsx";
import { GapsView } from "./views/gaps-view.tsx";
import { GovernanceView } from "./views/governance-view.tsx";
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
  const briefId = briefIdFromPath(path);
  const onAnalysis = path === "/analysis" || briefId !== null;
  const onGaps = path === "/gaps";
  const onMediaDesk = path === "/media" || mediaReference !== null;
  const onAiGovernance = path === "/ai";
  const onGovernance = path === "/governance";

  const title = briefId
    ? "Analysis brief"
    : onAnalysis
      ? "Content analysis"
      : onGaps
        ? "Knowledge gaps"
        : onMediaDesk
          ? "Media desk"
          : onGovernance || onAiGovernance
            ? "AI Governance"
            : "POPIA case queue";
  const subtitle =
    mediaReference ??
    caseReference ??
    (briefId
      ? briefId
      : onAnalysis
        ? "cited briefs from official content"
        : onGaps
          ? "what the corpus cannot answer"
          : onMediaDesk
            ? "media fact-check review"
            : onGovernance
              ? "policy, controls & model posture"
              : onAiGovernance
                ? "model & tool telemetry"
                : "staff & admin workspace");

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex flex-col">
            <span className="font-heading text-sm font-medium">{title}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{subtitle}</span>
          </div>
        </header>

        <div className="flex flex-1 flex-col p-4 md:p-6">
          {mediaReference ? (
            <MediaRequestView reference={mediaReference} />
          ) : onMediaDesk ? (
            <MediaQueueView />
          ) : caseReference ? (
            <CaseRequestView reference={caseReference} />
          ) : onGovernance ? (
            <GovernanceView />
          ) : onAiGovernance ? (
            <AiTelemetryView />
          ) : briefId ? (
            <AnalysisBriefView id={briefId} />
          ) : onAnalysis ? (
            <AnalysisView />
          ) : onGaps ? (
            <GapsView />
          ) : (
            <CaseQueueView />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
