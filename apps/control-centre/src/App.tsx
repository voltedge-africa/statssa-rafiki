import type { ReactNode } from "react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  Spinner,
} from "@voltedge/ui";

import { AppSidebar } from "./components/app-sidebar.tsx";
import { websiteUrl } from "./lib/env.ts";
import { usePath } from "./lib/router.ts";
import { signInUrl, useSession } from "./lib/session.tsx";
import { AiTelemetryView } from "./views/ai-telemetry-view.tsx";
import { CaseQueueView } from "./views/case-queue-view.tsx";
import { MediaQueueView } from "./views/media-queue-view.tsx";

function Gate({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="grid min-h-svh place-items-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">{action}</CardContent>
      </Card>
    </div>
  );
}

export function App() {
  const path = usePath();
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="grid min-h-svh place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!session) {
    return (
      <Gate
        title="Sign in to the control centre"
        description="The Staff and Admin workspace for Stats SA Rafiki."
        action={
          <Button nativeButton={false} render={<a href={signInUrl} />}>
            Sign in
          </Button>
        }
      />
    );
  }

  if (session.role === "Press") {
    return (
      <Gate
        title="Control centre is for Stats SA staff"
        description={`You are signed in as ${session.role}. Sign in with a Staff or Admin account to manage requests.`}
        action={
          <Button variant="outline" nativeButton={false} render={<a href={websiteUrl()} />}>
            Back to the public site
          </Button>
        }
      />
    );
  }

  const onMediaDesk = path === "/media";
  const onAiGovernance = path === "/ai";

  const title = onMediaDesk ? "Media desk" : onAiGovernance ? "AI Governance" : "POPIA case queue";
  const subtitle = onMediaDesk
    ? "media fact-check review"
    : onAiGovernance
      ? "model & tool telemetry"
      : "staff & admin workspace";

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
          {onMediaDesk ? (
            <MediaQueueView />
          ) : onAiGovernance ? (
            <AiTelemetryView />
          ) : (
            <CaseQueueView />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
