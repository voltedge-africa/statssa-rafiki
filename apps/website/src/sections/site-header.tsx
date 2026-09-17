import { LogOut, Menu } from "lucide-react";

import {
  Badge,
  Button,
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
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
  { href: "#capabilities", label: "Capabilities" },
  { href: "#governance", label: "Trust" },
  { href: "#faq", label: "FAQ" },
];

const mobileLinkClass =
  "rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted";

function SessionActions() {
  const { session, signOut } = useSession();

  if (!session) {
    return (
      <Button size="sm" nativeButton={false} render={<a href={signInUrl} />}>
        Sign in
      </Button>
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
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <a href="/" className="flex items-center">
          <img src="/statssa-logo.png" alt="Statistics South Africa" className="h-12 w-auto" />
        </a>

        <div className="hidden flex-1 justify-center md:flex">
          <NavigationMenu>
            <NavigationMenuList>
              {navigation.map((item) => (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink href={item.href}>{item.label}</NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-1">
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
                    AI-enabled public and media information assistant.
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
  );
}
