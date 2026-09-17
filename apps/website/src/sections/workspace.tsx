import { ArrowLeft, LogOut, ShieldAlert } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Spinner,
} from "@voltedge/ui";

import { ROLE_HOME, signInUrl, useSession, type Role } from "../lib/session.tsx";

export function Workspace({ required }: { required: Role }) {
  const { session, loading, signOut } = useSession();

  if (loading) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <Spinner className="size-6" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Sign in to continue</CardTitle>
            <CardDescription>This area is for {required} users.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button nativeButton={false} render={<a href={signInUrl} />}>
              Sign in
            </Button>
            <Button variant="ghost" nativeButton={false} render={<a href="/" />}>
              <ArrowLeft />
              Back to home
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (session.role !== required) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Not authorized</CardTitle>
            <CardDescription>
              This area is for {required} users. You are signed in as {session.role}.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-between">
            <Button variant="outline" onClick={() => void signOut()}>
              Switch account
            </Button>
            <Button nativeButton={false} render={<a href={ROLE_HOME[session.role]} />}>
              My workspace
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{session.role} workspace</CardTitle>
          <CardDescription>Signed in as {session.id}</CardDescription>
          <CardAction>
            <Badge>
              <ShieldAlert />
              {session.role}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            This is the signed-in {session.role.toLowerCase()} area. The working portals are still
            being built.
          </p>
        </CardContent>
        <CardFooter className="justify-between">
          <Button variant="ghost" nativeButton={false} render={<a href="/" />}>
            <ArrowLeft />
            Home
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut />
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
