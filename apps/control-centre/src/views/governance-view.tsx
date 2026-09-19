import { useEffect, useState } from "react";

import type {
  AiUsageSummary,
  GovernancePolicy,
  GovernanceSettings,
  GovernanceSettingsResponse,
} from "@voltedge/agent-contract";
import { listMediaRequests } from "@voltedge/media-ui";
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
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Spinner,
  Textarea,
  Toggle,
} from "@voltedge/ui";

import { getAiUsage } from "../lib/ai-telemetry-api.ts";
import { formatInt, formatMs } from "../lib/format.ts";
import { getGovernance, updateGovernance } from "../lib/governance-api.ts";
import { useSession } from "../lib/session.tsx";

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

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function GovernanceView() {
  const { session, loading } = useSession();

  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [escalation, setEscalation] = useState<{ total: number; gaps: number } | null>(null);
  const [data, setData] = useState<GovernanceSettingsResponse | null>(null);
  const [form, setForm] = useState<GovernanceSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const admin = session?.role === "Admin";

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    void getAiUsage({})
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
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

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    setLoadError(null);
    void getGovernance()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setForm(result.settings);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(message(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [admin]);

  const dirty = Boolean(form && data && JSON.stringify(form) !== JSON.stringify(data.settings));

  function patch(changes: Partial<GovernanceSettings>) {
    setForm((current) => (current ? { ...current, ...changes } : current));
    setSaved(false);
  }

  function updatePolicy(index: number, changes: Partial<GovernancePolicy>) {
    if (!form) return;
    patch({
      policies: form.policies.map((policy, i) =>
        i === index ? { ...policy, ...changes } : policy,
      ),
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await updateGovernance({
        confidenceMin: form.confidenceMin,
        generationEnabled: form.generationEnabled,
        enabledTools: form.enabledTools,
        policies: form.policies,
        incidentResponse: form.incidentResponse,
      });
      setData(result);
      setForm(result.settings);
      setSaved(true);
    } catch (caught) {
      setSaveError(message(caught));
    } finally {
      setSaving(false);
    }
  }

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            AI Governance
          </span>
          <h1 className="font-heading text-2xl font-medium">Governance</h1>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          {data?.settings.updatedAt ? <span>updated {data.settings.updatedAt}</span> : null}
          {saved ? <span className="text-emerald-600 dark:text-emerald-400">saved</span> : null}
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load the governance settings</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
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

      {!form || !data ? (
        <div className="grid place-items-center py-16">
          <Spinner className="size-5" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Generation &amp; escalation</CardTitle>
                <CardDescription>
                  These values are read live by the pipeline: the switch gates chat and drafting,
                  and the floor decides when a weak retrieval escalates to a human.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <Field>
                  <FieldLabel>AI generation</FieldLabel>
                  <div className="flex items-center gap-3">
                    <Toggle
                      variant="outline"
                      pressed={form.generationEnabled}
                      onPressedChange={(pressed: boolean) => patch({ generationEnabled: pressed })}
                    >
                      {form.generationEnabled ? "Enabled" : "Disabled"}
                    </Toggle>
                    <FieldDescription>
                      Disabling answers chat and every draft with an information gap.
                    </FieldDescription>
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="confidence-min">Confidence floor</FieldLabel>
                  <Input
                    id="confidence-min"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={form.confidenceMin}
                    onChange={(event) => patch({ confidenceMin: Number(event.target.value) })}
                  />
                  <FieldDescription>
                    Weakest cited passage similarity a draft may rest on. Passages below it escalate
                    to a communications official.
                  </FieldDescription>
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Capability allowlist</CardTitle>
                <CardDescription>
                  The tools the agent may call. A tool switched off is not offered to the model; new
                  sessions pick up the change immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.availableTools.map((tool) => {
                  const enabled = form.enabledTools.includes(tool);
                  return (
                    <Toggle
                      key={tool}
                      variant="outline"
                      size="sm"
                      pressed={enabled}
                      onPressedChange={(pressed: boolean) =>
                        patch({
                          enabledTools: pressed
                            ? [...form.enabledTools, tool]
                            : form.enabledTools.filter((item) => item !== tool),
                        })
                      }
                    >
                      <span className="font-mono text-[11px]">{tool}</span>
                    </Toggle>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Incident response</CardTitle>
                <CardDescription>
                  The operator playbook shown here and used in drills. Each step is editable.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {form.incidentResponse.map((step, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Textarea
                      rows={2}
                      value={step}
                      onChange={(event) =>
                        patch({
                          incidentResponse: form.incidentResponse.map((item, i) =>
                            i === index ? event.target.value : item,
                          ),
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patch({
                          incidentResponse: form.incidentResponse.filter((_, i) => i !== index),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => patch({ incidentResponse: [...form.incidentResponse, ""] })}
                >
                  Add step
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Controls enforced in the pipeline</CardTitle>
              <CardDescription>
                Each control is a mechanism, not a policy statement. Edit the wording; the
                enforcement is in the code.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {form.policies.map((policy, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                      policy {index + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patch({ policies: form.policies.filter((_, i) => i !== index) })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <Input
                    value={policy.area}
                    placeholder="Area"
                    onChange={(event) => updatePolicy(index, { area: event.target.value })}
                  />
                  <Input
                    value={policy.rule}
                    placeholder="Rule"
                    onChange={(event) => updatePolicy(index, { rule: event.target.value })}
                  />
                  <Textarea
                    rows={2}
                    value={policy.enforcement}
                    placeholder="How it is enforced"
                    onChange={(event) => updatePolicy(index, { enforcement: event.target.value })}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  patch({ policies: [...form.policies, { area: "", rule: "", enforcement: "" }] })
                }
              >
                Add policy
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
