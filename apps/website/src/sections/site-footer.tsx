import { Badge, Button, Separator } from "@voltedge/ui";

import { ROLE_HOME, signInUrl, useSession } from "../lib/session.tsx";

const explore = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#governance", label: "Trust" },
  { href: "#faq", label: "FAQ" },
];

export function SiteFooter() {
  const { session } = useSession();

  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <img src="/statssa-logo.png" alt="Statistics South Africa" className="h-12 w-auto" />
              <span className="text-xs text-muted-foreground">In partnership with</span>
              <img src="/sita-logo.png" alt="SITA" className="h-8 w-auto" />
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Rafiki helps you find your way to published Stats SA information. Answers include
              their sources, and people stay in the loop.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Published sources</Badge>
              <Badge variant="outline">Human-reviewed</Badge>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">Explore</span>
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
        </div>
        <Separator />
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            Statistics South Africa, delivered in partnership with SITA. Published statistics remain
            the authoritative record.
          </p>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={session ? ROLE_HOME[session.role] : signInUrl} />}
          >
            {session ? "My workspace" : "Sign in"}
          </Button>
        </div>
      </div>
    </footer>
  );
}
