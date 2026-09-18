import { useEffect, useState } from "react";
import { ArrowRight, FileCheck2, Landmark, ShieldCheck } from "lucide-react";

import type { MediaRequestPublic } from "@voltedge/media-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@voltedge/ui";
import { ApiError, StatusBadge, deadlinePhrase, listMyMediaRequests } from "@voltedge/media-ui";

import { signInUrl, useSession } from "../lib/session.tsx";

const STEPS = [
  {
    title: "Submit the claim or question",
    body: "Tell us what needs checking, who you write for and any deadline. Add context if it helps us find the right statistics.",
  },
  {
    title: "Rafiki retrieves the approved sources",
    body: "The assistant searches Stats SA publications and data releases and prepares a draft response with a citation for every figure. If the sources do not cover it, it flags the gap instead of guessing.",
  },
  {
    title: "A communications official reviews and approves",
    body: "Nothing is released automatically. An authorised Stats SA official edits the draft, checks the references and approves the response, which then appears here.",
  },
] as const;

const COMMITMENTS = [
  {
    icon: Landmark,
    title: "Official information only",
    body: "Every response is grounded in approved, published Stats SA material. Unsupported answers are never generated.",
  },
  {
    icon: ShareIcon,
    title: "Human review, always",
    body: "Media responses are never issued automatically. Final editorial responsibility rests with an authorised human official.",
  },
  {
    icon: FileCheck2,
    title: "Clearly referenced",
    body: "Each response lists the publications and data passages it draws on, so you can verify the numbers yourself.",
  },
  {
    icon: ShieldCheck,
    title: "Access-controlled",
    body: "Requests and drafts are visible only to you and the Stats SA reviewers working on your query.",
  },
] as const;

// Kept separate so the grid reads evenly with an odd icon set.
function ShareIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={props.className}
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

function RecentRequests({ requests }: { requests: MediaRequestPublic[] }) {
  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You have not filed a request yet. Once you do, its progress appears here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {requests.map((request) => (
        <li key={request.reference} className="border-t border-border first:border-t-0">
          <a
            href={`/requests/${request.reference}`}
            className="flex flex-col gap-1.5 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-muted/50"
          >
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {request.reference}
              </span>
              <StatusBadge status={request.status} />
            </span>
            <span className="line-clamp-1 text-sm font-medium">{request.claim}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {deadlinePhrase(request.deadline, request.status)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function HomeView() {
  const { session } = useSession();
  const [requests, setRequests] = useState<MediaRequestPublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signInFailed =
    new URLSearchParams(window.location.search).get("error") === "sign_in_failed";

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    listMyMediaRequests()
      .then((result) => {
        if (!cancelled) setRequests(result.requests.slice(0, 3));
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Could not load your requests.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <>
      <section className="grid gap-10 border-b border-border px-6 py-14 sm:px-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-14 lg:py-20">
        <div className="flex flex-col justify-center gap-6">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Media room
          </span>
          <h1 className="font-heading text-4xl leading-[1.05] font-medium text-balance sm:text-5xl">
            Fact-check what you publish against official statistics.
          </h1>
          <p className="max-w-[58ch] text-base leading-relaxed text-muted-foreground">
            File a media query and Stats SA will search its approved publications and data releases.
            You receive a reviewed, clearly referenced response — never an automatic, unreviewed
            answer.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button nativeButton={false} render={<a href={session ? "/request" : signInUrl} />}>
              File a fact-check request
              <ArrowRight />
            </Button>
            <Button variant="outline" nativeButton={false} render={<a href="#how-it-works" />}>
              How review works
            </Button>
          </div>
          {signInFailed ? (
            <Alert variant="destructive">
              <AlertTitle>Sign-in failed</AlertTitle>
              <AlertDescription>
                We could not complete the sign-in. Please try again.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <Card className="self-center">
          <CardHeader>
            <CardTitle>How a request is handled</CardTitle>
            <CardDescription>
              From submission to an approved response, with a human decision in the middle.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {STEPS.map((step, index) => (
              <div key={step.title} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary font-mono text-[11px]">
                  {index + 1}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{step.title}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{step.body}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section id="how-it-works" className="border-b border-border px-6 py-14 sm:px-10 lg:px-14">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          What you can expect
        </span>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {COMMITMENTS.map((item) => (
            <div key={item.title} className="flex flex-col gap-3 bg-background p-6">
              <item.icon className="size-5 text-brand" />
              <span className="text-sm font-medium">{item.title}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{item.body}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-14 sm:px-10 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-5">
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
              Your requests
            </span>
            {session ? (
              requests === null && !error ? (
                <Spinner className="size-5" />
              ) : error ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load your requests</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : (
                <>
                  <RecentRequests requests={requests ?? []} />
                  <Button
                    variant="outline"
                    className="self-start"
                    nativeButton={false}
                    render={<a href="/requests" />}
                  >
                    View all requests
                  </Button>
                </>
              )
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
                  Sign in to file a request and track it. Registration is free and takes a minute.
                </p>
                <Button nativeButton={false} render={<a href={signInUrl} />}>
                  Sign in or register
                </Button>
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Before you file</CardTitle>
              <CardDescription>How the media room handles your query.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Requests are for claims or questions about{" "}
                <span className="text-foreground">published statistics</span>. For personal
                information requests, use the POPIA desk on the main website.
              </p>
              <p>
                If your deadline is tight, include it. Urgent media queries are still reviewed by a
                person, so allow review time before publishing.
              </p>
              <p>
                You can withdraw a request while it is open. Once approved, the response and its
                references remain available in your account.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
