import { BadgeCheck, FileText, Sparkles } from "lucide-react";

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
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Separator,
} from "@voltedge/ui";

import { ROLE_HOME, signInUrl, useSession } from "../lib/session.tsx";

const trustMarkers = ["Approved sources only", "References included", "Human-reviewed"];

const sources = [
  {
    title: "Quarterly Labour Force Survey — Q1 2026",
    description: "Statistical release P0211 · published 12 May 2026",
  },
  {
    title: "Youth unemployment in South Africa",
    description: "Statistical release P0211.4.2 · published 20 May 2026",
  },
];

export function Hero() {
  const { session } = useSession();

  return (
    <section id="top" className="border-b border-border/60">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="flex flex-col items-start gap-6">
          <Badge variant="secondary">
            <Sparkles />
            Stats SA · AI-assisted information
          </Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Answers grounded in official statistics.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Rafiki helps you find clear, plain-language answers from published Stats SA information.
            Every answer includes the documents it came from, so you can read the source and judge
            it for yourself.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              nativeButton={false}
              render={<a href={session ? ROLE_HOME[session.role] : signInUrl} />}
            >
              {session ? "Go to workspace" : "Sign in"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<a href="#how-it-works" />}
            >
              See how it works
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {trustMarkers.map((marker) => (
              <Badge key={marker} variant="outline">
                {marker}
              </Badge>
            ))}
          </div>
        </div>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Unemployment rate, Q1 2026</CardTitle>
            <CardDescription>Answered from published sources</CardDescription>
            <CardAction>
              <Badge variant="outline">
                <BadgeCheck />
                Grounded
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="leading-relaxed">
              The official unemployment rate was{" "}
              <span className="font-medium text-foreground">32,1%</span> in the first quarter of
              2026, down 0,4 of a percentage point from the fourth quarter of 2025. The expanded
              unemployment rate was 42,4%.
            </p>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <FileText className="size-3.5" />
                Sources
              </div>
              <div className="flex flex-col gap-1">
                {sources.map((source) => (
                  <Item key={source.title} size="xs">
                    <ItemMedia variant="icon">
                      <FileText />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{source.title}</ItemTitle>
                      <ItemDescription>{source.description}</ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <span className="text-xs text-muted-foreground">Read the sources for yourself</span>
            <Badge variant="outline">P0211</Badge>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}
