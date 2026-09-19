import { useEffect, useState, type ReactNode } from "react";

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
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toggle,
} from "@voltedge/ui";

import { getAiUsage } from "../lib/ai-telemetry-api.ts";
import { formatInt, formatMs } from "../lib/format.ts";
import { getGovernance, updateGovernance } from "../lib/governance-api.ts";
import { useSession } from "../lib/session.tsx";

const EMPTY_POLICY: GovernancePolicy = { area: "", rule: "", enforcement: "" };

type Editor = { type: "policy"; index: number } | { type: "incident"; index: number } | null;

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

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
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
  const [editor, setEditor] = useState<Editor>(null);
  const [policyDraft, setPolicyDraft] = useState<GovernancePolicy>(EMPTY_POLICY);
  const [incidentDraft, setIncidentDraft] = useState("");

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
    void Promise.all([listMediaRequests({}), listMediaRequests({ status: "information_gap" })])
      .then(([all, gaps]) => {
        if (!cancelled) setEscalation({ total: all.total, gaps: gaps.total });
      })
      .catch(() => {
        if (!cancelled) setEscalation(null);
      });
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

  function openPolicy(index: number) {
    if (!form) return;
    const policy = index < 0 ? EMPTY_POLICY : form.policies[index];
    setPolicyDraft(policy ? { ...policy } : EMPTY_POLICY);
    setEditor({ type: "policy", index });
  }

  function savePolicy() {
    if (!form || !editor) return;
    const policies =
      editor.index < 0
        ? [...form.policies, policyDraft]
        : form.policies.map((item, i) => (i === editor.index ? policyDraft : item));
    patch({ policies });
    setEditor(null);
  }

  function openIncident(index: number) {
    if (!form) return;
    setIncidentDraft(index < 0 ? "" : (form.incidentResponse[index] ?? ""));
    setEditor({ type: "incident", index });
  }

  function saveIncident() {
    if (!form || !editor) return;
    const incidentResponse =
      editor.index < 0
        ? [...form.incidentResponse, incidentDraft]
        : form.incidentResponse.map((item, i) => (i === editor.index ? incidentDraft : item));
    patch({ incidentResponse });
    setEditor(null);
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
            <CardTitle>Admins only</CardTitle>
            <CardDescription>AI governance is for Admin accounts.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            AI Governance
          </span>
          <h1 className="font-heading text-2xl font-medium">Governance</h1>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          {saved ? <span className="text-emerald-600 dark:text-emerald-400">saved</span> : null}
          {dirty ? <span>unsaved</span> : null}
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load settings</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {saveError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {!form ? (
        <div className="grid place-items-center py-16">
          <Spinner className="size-5" />
        </div>
      ) : (
        <Tabs defaultValue="controls">
          <TabsList className="w-full">
            <TabsTrigger value="controls">Controls</TabsTrigger>
            <TabsTrigger value="policy">Policy</TabsTrigger>
            <TabsTrigger value="incident">Incident</TabsTrigger>
          </TabsList>

          <TabsContent value="controls" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Runtime controls</CardTitle>
                <CardDescription>Read live by the pipeline.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Row label="Generation" hint="kill switch">
                  <Toggle
                    variant="outline"
                    pressed={form.generationEnabled}
                    onPressedChange={(pressed: boolean) => patch({ generationEnabled: pressed })}
                  >
                    {form.generationEnabled ? "Enabled" : "Disabled"}
                  </Toggle>
                </Row>
                <Row label="Confidence floor" hint="escalation threshold">
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={form.confidenceMin}
                    onChange={(event) => patch({ confidenceMin: Number(event.target.value) })}
                    className="w-24"
                  />
                </Row>
                <div className="flex flex-col gap-2 pt-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Tools</span>
                    <span className="text-xs text-muted-foreground">Allowed to the model.</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data?.availableTools.map((tool) => (
                      <Toggle
                        key={tool}
                        variant="outline"
                        size="sm"
                        pressed={form.enabledTools.includes(tool)}
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
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="policy" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Enforced controls</CardTitle>
                <CardDescription>{form.policies.length} policies</CardDescription>
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => openPolicy(-1)}>
                    Add
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="pt-0">
                {form.policies.map((policy, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                        {policy.area || "untitled"}
                      </span>
                      <span className="text-sm font-medium">{policy.rule || "—"}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {policy.enforcement}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openPolicy(index)}>
                        Edit
                      </Button>
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
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incident" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Incident response</CardTitle>
                <CardDescription>{form.incidentResponse.length} steps</CardDescription>
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => openIncident(-1)}>
                    Add
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="pt-0">
                {form.incidentResponse.map((step, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="text-sm">{step}</span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openIncident(index)}>
                        Edit
                      </Button>
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
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Sheet
        open={editor?.type === "policy"}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editor && editor.index < 0 ? "Add policy" : "Edit policy"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <Field>
              <FieldLabel htmlFor="policy-area">Area</FieldLabel>
              <Input
                id="policy-area"
                value={policyDraft.area}
                onChange={(event) => setPolicyDraft({ ...policyDraft, area: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="policy-rule">Rule</FieldLabel>
              <Input
                id="policy-rule"
                value={policyDraft.rule}
                onChange={(event) => setPolicyDraft({ ...policyDraft, rule: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="policy-enforcement">Enforcement</FieldLabel>
              <Textarea
                id="policy-enforcement"
                rows={4}
                value={policyDraft.enforcement}
                onChange={(event) =>
                  setPolicyDraft({ ...policyDraft, enforcement: event.target.value })
                }
              />
            </Field>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button onClick={savePolicy}>Save</Button>
            <Button variant="outline" onClick={() => setEditor(null)}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editor?.type === "incident"}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editor && editor.index < 0 ? "Add step" : "Edit step"}</SheetTitle>
          </SheetHeader>
          <div className="px-4">
            <Field>
              <FieldLabel htmlFor="incident-step">Step</FieldLabel>
              <Textarea
                id="incident-step"
                rows={4}
                value={incidentDraft}
                onChange={(event) => setIncidentDraft(event.target.value)}
              />
            </Field>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button onClick={saveIncident}>Save</Button>
            <Button variant="outline" onClick={() => setEditor(null)}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}
