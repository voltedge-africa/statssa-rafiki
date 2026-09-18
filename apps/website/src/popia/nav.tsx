import { cn } from "@voltedge/ui";

import { useSession } from "../lib/session.tsx";
import type { PopiaView } from "./popia-app.tsx";

export function PopiaNav({ view }: { view: PopiaView }) {
  const { session } = useSession();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3 sm:px-10 lg:px-14">
      <span className="font-mono text-[11px] text-muted-foreground">POPIA · request desk</span>
      {session ? (
        <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto">
          <a
            href="/popia/my"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              view === "mine"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            My requests
          </a>
        </nav>
      ) : null}
    </div>
  );
}
