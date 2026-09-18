import { LogOut, Menu } from "lucide-react";

import {
  Badge,
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@voltedge/ui";

import { ROLE_HOME, signInUrl, useSession } from "../lib/session.tsx";

const navigation = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#capabilities", label: "What you can ask" },
  { href: "#governance", label: "Trust" },
  { href: "#faq", label: "FAQ" },
];

const mobileLinkClass =
  "rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted";

function StatusBar() {
  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-2 sm:px-10 lg:px-14">
      <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-brand" />
        public search is open, no account needed
      </span>
      <span className="hidden font-mono text-[11px] text-muted-foreground md:block">
        a SITA delivery for Statistics South Africa
      </span>
    </div>
  );
}

function SessionActions() {
  const { session, signOut } = useSession();

  if (!session) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<a href={signInUrl} />}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href={ROLE_HOME[session.role]} />}
      >
        <Badge variant="secondary">{session.role}</Badge>
        Workspace
      </Button>
      <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void signOut()}>
        <LogOut />
      </Button>
    </div>
  );
}

function MobileSessionActions() {
  const { session, signOut } = useSession();

  return (
    <div className="mt-auto flex flex-col gap-2 p-4">
      {session ? (
        <>
          <SheetClose
            render={
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={ROLE_HOME[session.role]} />}
              />
            }
          >
            {session.role} workspace
          </SheetClose>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut />
            Sign out
          </Button>
        </>
      ) : (
        <SheetClose
          render={<Button size="sm" nativeButton={false} render={<a href={signInUrl} />} />}
        >
          Sign in
        </SheetClose>
      )}
    </div>
  );
}

export function SiteHeader() {
  return (
    <>
      <StatusBar />
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex h-16 items-center gap-10 px-6 sm:px-10 lg:px-14">
          <a href="/" className="flex shrink-0 items-center">
            <img src="/statssa-logo.png" alt="Statistics South Africa" className="h-10 w-auto" />
          </a>

          <nav className="hidden flex-1 items-center gap-6 md:flex">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block">
              <SessionActions />
            </div>
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger
                  render={<Button variant="ghost" size="icon" aria-label="Open navigation" />}
                >
                  <Menu />
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>Stats SA Rafiki</SheetTitle>
                    <SheetDescription>
                      Answers from published Statistics South Africa information.
                    </SheetDescription>
                  </SheetHeader>
                  <nav className="grid gap-1 px-4">
                    {navigation.map((item) => (
                      <SheetClose
                        key={item.href}
                        render={<a href={item.href} className={mobileLinkClass} />}
                      >
                        {item.label}
                      </SheetClose>
                    ))}
                  </nav>
                  <MobileSessionActions />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
