import { Button } from "@voltedge/ui";

import { workspaceHome } from "../lib/workspaces.ts";
import { signInUrl, useSession } from "../lib/session.tsx";

const explore = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#capabilities", label: "What you can ask" },
  { href: "#governance", label: "Trust" },
  { href: "#faq", label: "FAQ" },
];

const popia = [
  { href: "/popia", label: "Submit a request" },
  { href: "/popia/track", label: "Track a request" },
  { href: "/popia/my", label: "My requests" },
];

export function SiteFooter() {
  const { session } = useSession();

  return (
    <footer className="border-t border-border">
      <div className="grid gap-10 px-6 py-14 sm:px-10 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-16 lg:px-14">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-4">
            <img src="/statssa-logo.png" alt="Statistics South Africa" className="h-12 w-auto" />
            <span className="text-xs text-muted-foreground">In partnership with</span>
            <img src="/sita-logo.png" alt="SITA" className="h-8 w-auto" />
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Rafiki helps you find your way to published Stats SA information. Answers include their
            sources, and people stay in the loop.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">explore</span>
          <nav className="flex flex-col gap-2">
            {explore.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">POPIA</span>
          <nav className="flex flex-col gap-2">
            {popia.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">access</span>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={session ? workspaceHome(session.role) : signInUrl} />}
          >
            {session ? "My workspace" : "Sign in"}
          </Button>
        </div>
      </div>

      <div className="border-t border-border px-6 py-6 sm:px-10 lg:px-14">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Statistics South Africa, delivered in partnership with SITA. Published statistics remain
          the authoritative record.
        </p>
      </div>
    </footer>
  );
}
