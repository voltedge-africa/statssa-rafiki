import { Capabilities } from "./sections/capabilities.tsx";
import { Faq } from "./sections/faq.tsx";
import { Governance } from "./sections/governance.tsx";
import { Hero } from "./sections/hero.tsx";
import { HowItWorks } from "./sections/how-it-works.tsx";
import { SiteFooter } from "./sections/site-footer.tsx";
import { SiteHeader } from "./sections/site-header.tsx";
import { Workspace } from "./sections/workspace.tsx";
import type { Role } from "./lib/session.tsx";

const WORKSPACE_ROLES: Record<string, Role> = {
  "/press": "Press",
  "/staff": "Staff",
  "/admin": "Admin",
};

function currentPath() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

export function App() {
  const required = WORKSPACE_ROLES[currentPath()];

  if (required) {
    return <Workspace required={required} />;
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Capabilities />
        <Governance />
        <Faq />
      </main>
      <SiteFooter />
    </div>
  );
}
