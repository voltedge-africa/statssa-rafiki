import { PopiaApp } from "./popia/popia-app.tsx";
import { Capabilities } from "./sections/capabilities.tsx";
import { Faq } from "./sections/faq.tsx";
import { Governance } from "./sections/governance.tsx";
import { Hero } from "./sections/hero.tsx";
import { HowItWorks } from "./sections/how-it-works.tsx";
import { SiteFooter } from "./sections/site-footer.tsx";
import { SiteHeader } from "./sections/site-header.tsx";

function currentPath() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

export function App() {
  const path = currentPath();

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh w-full max-w-[1200px] flex-col border-x border-border">
        <SiteHeader />
        <main className="flex-1">
          {path === "/popia" || path.startsWith("/popia/") ? (
            <PopiaApp path={path} />
          ) : (
            <>
              <Hero />
              <HowItWorks />
              <Capabilities />
              <Governance />
              <Faq />
            </>
          )}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
