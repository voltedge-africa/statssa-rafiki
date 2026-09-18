import { SiteFooter } from "./components/site-footer.tsx";
import { SiteHeader } from "./components/site-header.tsx";
import { referenceFromPath, usePath } from "./lib/router.ts";
import { LandingView } from "./views/landing-view.tsx";
import { MyRequestsView } from "./views/my-requests-view.tsx";
import { NotFoundView } from "./views/not-found-view.tsx";
import { RequestDetailView } from "./views/request-detail-view.tsx";
import { RequestView } from "./views/request-view.tsx";

export function App() {
  const path = usePath();
  const reference = referenceFromPath(path);

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh w-full max-w-[1200px] flex-col border-x border-border">
        <SiteHeader />
        <main className="flex-1">
          {path === "/" || path === "/feed" ? (
            <LandingView />
          ) : path === "/request" ? (
            <RequestView />
          ) : path === "/requests" ? (
            <MyRequestsView />
          ) : reference ? (
            <RequestDetailView reference={reference} />
          ) : (
            <NotFoundView />
          )}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
