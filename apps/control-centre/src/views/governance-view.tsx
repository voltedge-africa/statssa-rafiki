import { useEffect, useState } from "react";

import type { AiUsageSummary } from "@voltedge/agent-contract";
import { listMediaRequests } from "@voltedge/media-ui";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@voltedge/ui";

import { ApiError, getAiUsage } from "../lib/ai-telemetry-api.ts";
import { formatInt, formatMs } from "../lib/format.ts";
import { useSession } from "../lib/session.tsx";

interface Policy {
  area: string;
  rule: string;
  enforcement: string;
}

/**
 * The controls that already exist in code, stated where they are enforced. This is
 * the AI governance framework as a page rather than a slide: every row names a
 * mechanism a judge can trace back to the pipeline.
 */
const POLICIES: Policy[] = [
  {
    area: "Retrieval",
    rule: "Answers draw only on approved, indexed Stats SA passages.",
    enforcement:
      "The draft service returns an information gap and makes no model call when retrieval finds nothing.",
  },
  {
    area: "Grounding",
    rule: "Every figure is cited as [source#chunk].",
    enforcement:
      "The post-generation gate blocks release unless the text cites at least one retrieved passage, and only retrieved ones.",
  },
  {
    area: "Confidence",
    rule: "Weak retrieval escalates to a human.",
    enforcement:
      "The weakest cited passage similarity must clear the confidence floor; below it the release action is disabled.",
  },
  {
    area: "Human approval",
    rule: "Nothing is released without a communications official.",
    enforcement:
      "Only an approve call moves a request to approved; there is no automated publish path.",
  },
  {
    area: "Reviewer guidance",
    rule: "Guidance steers emphasis, never invents facts.",
    enforcement:
      "Reviewer guidance is subordinate to the passages in the prompt and cannot introduce unsupported claims.",
  },
  {
    area: "Labelling",
    rule: "AI content is always identifiable.",
    enforcement:
      "The draft card is structurally badged AI-generated and not approved; the requester never sees drafts.",
  },
  {
    area: "Data minimisation",
    rule: "Telemetry records behaviour, not content.",
    enforcement: "Persisted spans strip prompts, completions, tool arguments and outputs.",
  },
  {
    area: "Access",
    rule: "Least privilege by role.",
    enforcement:
      "Press, Staff and Admin capabilities are separated at the API guard and the app proxies.",
  },
];

/** Tools the agent is allowed to call. Anything not listed is not reachable. */
const CAPABILITY_ALLOWLIST = [
  "search_statssa",
  "calculate",
  "current_time",
  "ui blocks (chart, table, sources, document)",
];

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function GovernanceView() {
  const { session, loading } = useSession();

  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [escalation, setEscalation] = useState<{ total: number; gaps: number } | null>(null);

  const admin = session?.role === "Admin";

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    setSummary(null);
    setError(null);
    void getAiUsage({})
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Could not load AI usage.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [admin]);

  // Escalation is the share of media requests the pipeline could not draft, or that a
  // human had to review: the clearest sign of where the corpus or model needs work.
  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    void Promise.all([listMediaRequests({}), listMediaRequests({ status: "information_gap" })])
      .then(([all, gaps]) => {
        if (!cancelled) setEscalation({ total: all.total, gaps: gaps.total });
      })
      .catch(() => {
        if (!cancelled) setEscalation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [admin]);

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!admin) {
    return (
      <section className="grid min-h-[60vh] place-items-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>AI governance is for administrators</CardTitle>
            <CardDescription>
              {session
                ? `You are signed in as ${session.role}. This area is for Admin users.`
                : "Sign in with an Admin account to view the governance framework."}
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          AI Governance
        </span>
        <h1 className="font-heading text-2xl font-medium">Governance</h1>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load the governance signals</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Model requests" value={formatInt(summary?.totals.requests)} />
        <Tile label="Tool calls" value={formatInt(summary?.totals.toolCalls)} />
        <Tile label="Errors" value={formatInt(summary?.totals.errorCount)} />
        <Tile label="Avg latency" value={formatMs(summary?.totals.avgDurationMs)} />
        <Tile label="Media requests" value={formatInt(escalation?.total)} />
        <Tile
          label="Escalation rate"
          value={
            escalation && escalation.total > 0
              ? `${Math.round((escalation.gaps / escalation.total) * 100)}%`
              : "—"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Controls enforced in the pipeline</CardTitle>
            <CardDescription>
              Each control is a mechanism, not a policy statement, and is traceable to the code that
              applies it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {POLICIES.map((policy) => (
              <div
                key={policy.area}
                className="flex flex-col gap-1 border-t border-border pt-4 first:border-t-0 first:pt-0"
              >
                <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                  {policy.area}
                </span>
                <span className="text-sm font-medium">{policy.rule}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {policy.enforcement}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Capability allowlist</CardTitle>
              <CardDescription>
                Tools the agent is designed to call, taken from its tool registry. Adding one is a
                reviewed code change, not a configuration toggle.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {CAPABILITY_ALLOWLIST.map((capability) => (
                <Badge key={capability} variant="outline" className="font-mono text-[11px]">
                  {capability}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Models in use</CardTitle>
              <CardDescription>
                Observed from persisted telemetry. The provider and model are pinned in
                configuration, so the deployment can swap providers without changing the pipeline.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(summary?.byModel ?? []).length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  No model calls recorded for the current period.
                </span>
              ) : (
                summary?.byModel.map((model) => (
                  <Badge key={model.key} variant="secondary" className="font-mono text-[11px]">
                    {model.key} · {formatInt(model.requests)}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Incident response</CardTitle>
              <CardDescription>
                Documented now; the live kill switch is planned. Until then the operator actions are
                manual and auditable.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">Rotate the provider key</span> to revoke model
                access immediately; drafting surfaces an information gap rather than failing open.
              </p>
              <p>
                <span className="text-foreground">Remove the corpus index</span> to force every
                request to an information gap and out of automated drafting.
              </p>
              <p>
                <span className="text-foreground">Every action is observable</span> in the telemetry
                view, and no prompt or completion content is retained.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
