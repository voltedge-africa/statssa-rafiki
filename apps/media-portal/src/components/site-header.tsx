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

import { reviewDeskUrl } from "../env.ts";
import { signInUrl, useSession } from "../lib/session.tsx";

const navigation = [
  { href: "/", label: "Media room" },
  { href: "/request", label: "File a request" },
  { href: "/requests", label: "My requests" },
];

const mobileLinkClass =
  "rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted";

function StatusBar() {
  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-2 sm:px-10 lg:px-14">
      <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-brand" />
        every response is reviewed by a Stats SA communications official
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
      <Button variant="outline" size="sm" nativeButton={false} render={<a href={signInUrl} />}>
        Sign in
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {session.role !== "Press" ? (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={reviewDeskUrl()} />}
        >
          Review desk
        </Button>
      ) : null}
      <Badge variant="secondary" className="hidden sm:inline-flex">
        {session.role}
      </Badge>
      <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void signOut()}>
        <LogOut />
      </Button>
    </div>
  );
}

export function SiteHeader() {
  const { session, signOut } = useSession();

  return (
    <>
      <StatusBar />
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex h-16 items-center gap-10 px-6 sm:px-10 lg:px-14">
          <a href="/" className="flex shrink-0 items-center gap-3">
            <img src="/statssa-logo.png" alt="Statistics South Africa" className="h-10 w-auto" />
            <span className="hidden border-l border-border pl-3 font-mono text-[11px] tracking-widest text-muted-foreground uppercase sm:block">
              media room
            </span>
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
                    <SheetTitle>Stats SA media room</SheetTitle>
                    <SheetDescription>
                      Fact-check requests answered from published Statistics South Africa
                      information, with human review.
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
                  <div className="mt-auto flex flex-col gap-2 p-4">
                    {session ? (
                      <>
                        {session.role !== "Press" ? (
                          <SheetClose
                            render={
                              <Button
                                variant="outline"
                                size="sm"
                                nativeButton={false}
                                render={<a href={reviewDeskUrl()} />}
                              />
                            }
                          >
                            Review desk
                          </SheetClose>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                          <LogOut />
                          Sign out
                        </Button>
                      </>
                    ) : (
                      <SheetClose
                        render={
                          <Button size="sm" nativeButton={false} render={<a href={signInUrl} />} />
                        }
                      >
                        Sign in
                      </SheetClose>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
