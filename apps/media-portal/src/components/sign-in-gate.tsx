import type { ReactNode } from "react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@voltedge/ui";

import { signInUrl } from "../lib/session.tsx";

export function SignInGate({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {action ?? (
            <Button nativeButton={false} render={<a href={signInUrl} />}>
              Sign in or register
            </Button>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            New accounts choose a role during registration. Media and press stakeholders register as{" "}
            <span className="font-medium text-foreground">Press</span>; Stats SA officials use their
            Staff or Admin account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
