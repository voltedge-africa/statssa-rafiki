import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { SlidersHorizontal } from "lucide-react";

import type {
  AiModelCall,
  AiPage,
  AiSessionSpan,
  AiSpanKind,
  AiToolCall,
  AiUsageBucket,
  AiUsageFilters,
  AiUsageSummary,
} from "@voltedge/agent-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@voltedge/ui";

import {
  ApiError,
  getAiSession,
  getAiUsage,
  listAiModelCalls,
  listAiToolCalls,
} from "../lib/ai-telemetry-api.ts";
import { formatCost, formatInt, formatMs, formatTime } from "../lib/format.ts";
import { useSession } from "../lib/session.tsx";

const PAGE_SIZE = 25;

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const EMPTY_FORM = {
  from: "",
  to: "",
  model: "",
  feature: "",
  role: "",
  tool: "",
  session: "",
};

type FormState = typeof EMPTY_FORM;

const FEATURES = [
  { value: "", label: "All surfaces" },
  { value: "chat", label: "Chat" },
  { value: "media_draft", label: "Media draft" },
] as const;

const ROLES = ["", "Press", "Staff", "Admin", "anonymous"] as const;

function featureLabel(feature: string | null): string {
  if (!feature) return "—";
  if (feature === "chat") return "Chat";
  if (feature === "media_draft") return "Media draft";
  return feature;
}

function detail(span: AiSessionSpan): string {
  if (span.kind === "model_request") {
    return [span.model, span.operation].filter(Boolean).join(" · ") || "model request";
  }
  if (span.kind === "tool") {
    return span.toolIsError ? `${span.toolName ?? "tool"} (error)` : (span.toolName ?? "tool");
  }
  return span.feature ? featureLabel(span.feature) : span.name;
}

function filtersFrom(form: FormState): AiUsageFilters {
  const filters: AiUsageFilters = {};
  if (form.from) filters.from = new Date(`${form.from}T00:00:00.000Z`).toISOString();
  if (form.to) {
    const end = new Date(`${form.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    filters.to = end.toISOString();
  }
  if (form.model.trim()) filters.model = form.model.trim();
  if (form.feature) filters.feature = form.feature;
  if (form.role) filters.role = form.role;
  if (form.tool.trim()) filters.tool = form.tool.trim();
  if (form.session.trim()) filters.sessionId = form.session.trim();
  return filters;
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <select id={id} value={value} onChange={onChange} className={SELECT_CLASS}>
      {children}
    </select>
  );
}

function StatusPill({ status, label }: { status: "ok" | "error"; label?: string }) {
  return (
    <Badge variant={status === "error" ? "destructive" : "outline"}>
      {label ?? (status === "error" ? "Error" : "OK")}
    </Badge>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function BreakdownTable({ group, rows }: { group: string; rows: AiUsageBucket[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{group}</TableHead>
          <TableHead className="text-right">Requests</TableHead>
          <TableHead className="text-right">Tool calls</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Cost (ZAR)</TableHead>
          <TableHead className="text-right">Avg latency</TableHead>
          <TableHead className="text-right">Errors</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={7}>No usage matches these filters.</EmptyRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-medium">{row.key}</TableCell>
              <TableCell className="text-right font-mono">{formatInt(row.requests)}</TableCell>
              <TableCell className="text-right font-mono">{formatInt(row.toolCalls)}</TableCell>
              <TableCell className="text-right font-mono">{formatInt(row.totalTokens)}</TableCell>
              <TableCell className="text-right font-mono">{formatCost(row.costUsd)}</TableCell>
              <TableCell className="text-right font-mono">{formatMs(row.avgDurationMs)}</TableCell>
              <TableCell className="text-right font-mono">{formatInt(row.errorCount)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function Pager({
  page,
  offset,
  loading,
  onOffset,
}: {
  page: AiPage<unknown> | null;
  offset: number;
  loading: boolean;
  onOffset: (offset: number) => void;
}) {
  const total = page?.total ?? 0;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between pt-4 font-mono text-[11px] text-muted-foreground">
      <span>
        {start}–{end} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={loading || offset === 0}
          onClick={() => onOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || offset + PAGE_SIZE >= total}
          onClick={() => onOffset(offset + PAGE_SIZE)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function kindLabel(kind: AiSpanKind): string {
  if (kind === "model_request") return "Model request";
  if (kind === "tool") return "Tool";
  if (kind === "turn") return "Turn";
  return "Span";
}

export function AiTelemetryView() {
  const { session, loading } = useSession();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [applied, setApplied] = useState<AiUsageFilters>({});
  const [reload, setReload] = useState(0);
  const [queryOpen, setQueryOpen] = useState(false);

  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [modelPage, setModelPage] = useState<AiPage<AiModelCall> | null>(null);
  const [modelOffset, setModelOffset] = useState(0);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);

  const [toolPage, setToolPage] = useState<AiPage<AiToolCall> | null>(null);
  const [toolOffset, setToolOffset] = useState(0);
  const [toolError, setToolError] = useState<string | null>(null);
  const [toolLoading, setToolLoading] = useState(true);

  const [sessionSpans, setSessionSpans] = useState<AiSessionSpan[] | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const admin = session?.role === "Admin";

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    setSummary(null);
    setSummaryError(null);
    void getAiUsage(applied)
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setSummaryError(message(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [admin, applied, reload]);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    setModelLoading(true);
    setModelError(null);
    void listAiModelCalls(applied, PAGE_SIZE, modelOffset)
      .then((result) => {
        if (!cancelled) setModelPage(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setModelPage(null);
          setModelError(message(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setModelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [admin, applied, modelOffset, reload]);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    setToolLoading(true);
    setToolError(null);
    void listAiToolCalls(applied, PAGE_SIZE, toolOffset)
      .then((result) => {
        if (!cancelled) setToolPage(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setToolPage(null);
          setToolError(message(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setToolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [admin, applied, toolOffset, reload]);

  useEffect(() => {
    if (!admin || !applied.sessionId) {
      setSessionSpans(null);
      setSessionError(null);
      return;
    }
    let cancelled = false;
    setSessionLoading(true);
    setSessionError(null);
    void getAiSession(applied.sessionId)
      .then((result) => {
        if (!cancelled) setSessionSpans(result.spans);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setSessionSpans(null);
          setSessionError(message(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [admin, applied, reload]);

  const update = useCallback(
    (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
    },
    [],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModelOffset(0);
    setToolOffset(0);
    setApplied(filtersFrom(form));
    setQueryOpen(false);
  }

  function handleReset() {
    setForm(EMPTY_FORM);
    setModelOffset(0);
    setToolOffset(0);
    setApplied({});
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
                : "Sign in with an Admin account to view AI usage."}
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
          <h1 className="font-heading text-2xl font-medium">Telemetry</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setQueryOpen(true)}>
            <SlidersHorizontal />
            Query telemetry
          </Button>
          <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
            <span>{formatInt(summary?.totals.requests)} model requests</span>
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => setReload((value) => value + 1)}
            >
              refresh
            </button>
          </div>
        </div>
      </div>

      <Sheet open={queryOpen} onOpenChange={setQueryOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Query telemetry</SheetTitle>
            <SheetDescription>
              Filter persisted AI usage by date, model, tool, surface and portal role. Dates are
              inclusive; leave a field blank to ignore it.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
              <Field>
                <FieldLabel htmlFor="ai-from">From</FieldLabel>
                <Input id="ai-from" type="date" value={form.from} onChange={update("from")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-to">To</FieldLabel>
                <Input id="ai-to" type="date" value={form.to} onChange={update("to")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-model">Model</FieldLabel>
                <Input
                  id="ai-model"
                  value={form.model}
                  placeholder="muse-spark"
                  onChange={update("model")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-tool">Tool</FieldLabel>
                <Input
                  id="ai-tool"
                  value={form.tool}
                  placeholder="search_statssa"
                  onChange={update("tool")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-feature">Surface</FieldLabel>
                <Select id="ai-feature" value={form.feature} onChange={update("feature")}>
                  {FEATURES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-role">Portal role</FieldLabel>
                <Select id="ai-role" value={form.role} onChange={update("role")}>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role === "" ? "All roles" : role}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-session">Session id</FieldLabel>
                <Input
                  id="ai-session"
                  value={form.session}
                  placeholder="chat-… (opens the session trace)"
                  onChange={update("session")}
                />
              </Field>
            </div>

            <SheetFooter className="flex-row gap-2">
              <Button type="submit">Run query</Button>
              <Button type="button" variant="outline" onClick={handleReset}>
                Reset
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {summaryError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load the usage summary</AlertTitle>
          <AlertDescription>{summaryError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Model requests" value={formatInt(summary?.totals.requests)} />
        <Metric label="Tool calls" value={formatInt(summary?.totals.toolCalls)} />
        <Metric label="Input tokens" value={formatInt(summary?.totals.inputTokens)} />
        <Metric label="Output tokens" value={formatInt(summary?.totals.outputTokens)} />
        <Metric label="Total tokens" value={formatInt(summary?.totals.totalTokens)} />
        <Metric label="Cost (ZAR)" value={formatCost(summary?.totals.costUsd)} />
        <Metric label="Avg latency" value={formatMs(summary?.totals.avgDurationMs)} />
        <Metric label="Errors" value={formatInt(summary?.totals.errorCount)} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="model-calls">Model calls</TabsTrigger>
          <TabsTrigger value="tool-calls">Tool calls</TabsTrigger>
          <TabsTrigger value="session">Session trace</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6">
          <Panel title="Usage by model" description="Requests, tokens and cost per model.">
            <BreakdownTable group="Model" rows={summary?.byModel ?? []} />
          </Panel>
          <Panel title="Usage by tool" description="How the model is calling each tool.">
            <BreakdownTable group="Tool" rows={summary?.byTool ?? []} />
          </Panel>
          <Panel title="Usage by day" description="Daily volume across the selected period.">
            <BreakdownTable group="Day" rows={summary?.byDay ?? []} />
          </Panel>
          <Panel
            title="Usage by surface and role"
            description="Which portal and feature drove the calls."
          >
            <BreakdownTable group="Surface" rows={summary?.byFeature ?? []} />
            <div className="h-6" />
            <BreakdownTable group="Portal role" rows={summary?.byRole ?? []} />
          </Panel>
        </TabsContent>

        <TabsContent value="model-calls">
          <Panel title="Model calls" description="Every recorded provider request, newest first.">
            {modelError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load model calls</AlertTitle>
                <AlertDescription>{modelError}</AlertDescription>
              </Alert>
            ) : modelLoading ? (
              <div className="grid place-items-center py-16">
                <Spinner className="size-5" />
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Surface</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">In → out</TableHead>
                      <TableHead className="text-right">Cost (ZAR)</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(modelPage?.items.length ?? 0) === 0 ? (
                      <EmptyRow colSpan={8}>No model calls match these filters.</EmptyRow>
                    ) : (
                      modelPage?.items.map((call) => (
                        <TableRow key={call.spanUid}>
                          <TableCell className="font-mono text-[11px] text-muted-foreground">
                            {formatTime(call.startedAt)}
                          </TableCell>
                          <TableCell className="font-medium">{call.model ?? "—"}</TableCell>
                          <TableCell>{featureLabel(call.feature)}</TableCell>
                          <TableCell>{call.clientRole ?? "—"}</TableCell>
                          <TableCell>
                            <StatusPill status={call.status} />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatInt(call.inputTokens)} → {formatInt(call.outputTokens)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCost(call.costUsd)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatMs(call.durationMs)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <Pager
                  page={modelPage}
                  offset={modelOffset}
                  loading={modelLoading}
                  onOffset={setModelOffset}
                />
              </>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="tool-calls">
          <Panel
            title="Tool calls"
            description="Tool executions, errors and latency, newest first."
          >
            {toolError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load tool calls</AlertTitle>
                <AlertDescription>{toolError}</AlertDescription>
              </Alert>
            ) : toolLoading ? (
              <div className="grid place-items-center py-16">
                <Spinner className="size-5" />
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Tool</TableHead>
                      <TableHead>Surface</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(toolPage?.items.length ?? 0) === 0 ? (
                      <EmptyRow colSpan={7}>No tool calls match these filters.</EmptyRow>
                    ) : (
                      toolPage?.items.map((call) => (
                        <TableRow key={call.spanUid}>
                          <TableCell className="font-mono text-[11px] text-muted-foreground">
                            {formatTime(call.startedAt)}
                          </TableCell>
                          <TableCell className="font-medium">{call.toolName ?? "—"}</TableCell>
                          <TableCell>{featureLabel(call.feature)}</TableCell>
                          <TableCell>{call.clientRole ?? "—"}</TableCell>
                          <TableCell>
                            <StatusPill status={call.status} />
                          </TableCell>
                          <TableCell className="max-w-[28ch] truncate text-muted-foreground">
                            {call.errorMessage ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatMs(call.durationMs)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <Pager
                  page={toolPage}
                  offset={toolOffset}
                  loading={toolLoading}
                  onOffset={setToolOffset}
                />
              </>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="session">
          <Panel
            title="Session trace"
            description="Every persisted span for one session, in order. Enter a session id above."
          >
            {!applied.sessionId ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Enter a session id in the filters and run the query to see its span tree.
              </p>
            ) : sessionError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load the session</AlertTitle>
                <AlertDescription>{sessionError}</AlertDescription>
              </Alert>
            ) : sessionLoading ? (
              <div className="grid place-items-center py-16">
                <Spinner className="size-5" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Span</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sessionSpans?.length ?? 0) === 0 ? (
                    <EmptyRow colSpan={6}>No spans stored for this session.</EmptyRow>
                  ) : (
                    sessionSpans?.map((span) => (
                      <TableRow key={span.spanUid}>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {formatTime(span.startedAt)}
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">{span.name}</TableCell>
                        <TableCell>{kindLabel(span.kind)}</TableCell>
                        <TableCell className="text-muted-foreground">{detail(span)}</TableCell>
                        <TableCell>
                          <StatusPill status={span.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatMs(span.durationMs)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </section>
  );
}
