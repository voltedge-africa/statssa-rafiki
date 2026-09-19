import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  Banknote,
  CircleAlert,
  Clock,
  Inbox,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalyticsSnapshot } from "@voltedge/analytics-contract";
import { MEDIA_REQUEST_STATUS_LABELS, type MediaRequestStatus } from "@voltedge/media-contract";
import {
  POPIA_REQUEST_STATUS_LABELS,
  POPIA_REQUEST_TYPE_LABELS,
  type PopiaRequestStatus,
  type PopiaRequestType,
} from "@voltedge/popia-contract";
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
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  Spinner,
  cn,
  type ChartConfig,
} from "@voltedge/ui";

import { ApiError, getAnalytics } from "../lib/analytics-api.ts";
import {
  formatCost,
  formatInt,
  formatMs,
  formatTime,
  formatZar,
  formatZarCompact,
  usdToZar,
} from "../lib/format.ts";
import { useSession } from "../lib/session.tsx";

const DAY_RANGES = [7, 30, 90] as const;
type DayRange = (typeof DAY_RANGES)[number];

const compact = new Intl.NumberFormat("en-ZA", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("en-ZA", { style: "percent", maximumFractionDigits: 0 });

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });
}

function formatHours(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return "<1 h";
  return `${value.toFixed(1)} h`;
}

const TONES = {
  blue: "bg-chart-1/10 text-chart-1",
  green: "bg-chart-2/10 text-chart-2",
  amber: "bg-chart-3/10 text-chart-3",
  red: "bg-destructive/10 text-destructive",
  slate: "bg-chart-5/10 text-chart-5",
} as const;

type Tone = keyof typeof TONES;

// One palette for every status a chart can plot; the same status keeps its colour
// across the POPIA donut and the media pipeline.
const STATUS_COLORS: Record<PopiaRequestStatus | MediaRequestStatus, string> = {
  submitted: "#6b8bb8",
  acknowledged: "#1082ff",
  in_review: "#b08010",
  awaiting_information: "#d97706",
  completed: "#0e8a5f",
  rejected: "#c4332b",
  withdrawn: "#94a3b8",
  analysing: "#1082ff",
  awaiting_review: "#b08010",
  information_gap: "#d97706",
  approved: "#0e8a5f",
};

const POPIA_TYPE_SHORT: Record<PopiaRequestType, string> = {
  access: "Access",
  correction: "Correction",
  deletion: "Deletion",
  objection: "Objection",
};

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: Tone;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", TONES[tone])}>
            <Icon className="size-3.5" />
          </span>
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function Panel({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyChart({ children }: { children: string }) {
  return (
    <p className="grid h-[260px] place-items-center text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function StatusList({
  rows,
  formatLabel,
}: {
  rows: { key: string; count: number }[];
  formatLabel: (key: string) => string;
}) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span
              className="size-2 rounded-[3px]"
              style={{ backgroundColor: STATUS_COLORS[row.key as PopiaRequestStatus] }}
            />
            {formatLabel(row.key)}
          </span>
          <span className="font-mono tabular-nums">{formatInt(row.count)}</span>
        </li>
      ))}
    </ul>
  );
}

export function AnalyticsView() {
  const { session, loading } = useSession();

  const [days, setDays] = useState<DayRange>(30);
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (loading || !session) return;
    let cancelled = false;
    setError(null);
    void getAnalytics(days)
      .then((result) => {
        if (!cancelled) setSnapshot(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [days, reload, loading, session]);

  if (loading || !snapshot) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        {error ? (
          <Alert variant="destructive" className="max-w-md">
            <AlertTitle>Could not load analytics</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <Spinner className="size-6" />
        )}
      </div>
    );
  }

  const { popia, media, ai } = snapshot;

  const intakeConfig: ChartConfig = {
    popia: { label: "POPIA cases", color: "var(--chart-1)" },
    media: { label: "Media requests", color: "var(--chart-2)" },
    ...(ai ? { ai: { label: "AI requests", color: "var(--chart-3)" } } : {}),
  };
  const intakeData = popia.daily.map((day, index) => ({
    date: day.date,
    popia: day.received,
    media: media.daily[index]?.received ?? 0,
    ...(ai ? { ai: ai.daily[index]?.requests ?? 0 } : {}),
  }));

  const backlogRows = popia.byStatus.filter((row) => row.count > 0);
  const backlogTotal = popia.byStatus.reduce((sum, row) => sum + row.count, 0);
  const backlogConfig: ChartConfig = Object.fromEntries(
    backlogRows.map((row) => [
      row.key,
      { label: POPIA_REQUEST_STATUS_LABELS[row.key], color: STATUS_COLORS[row.key] },
    ]),
  );

  const typeRows = popia.byType;
  const pipelineRows = media.byStatus;

  const aiConfig: ChartConfig = {
    totalTokens: { label: "Tokens", color: "var(--chart-1)" },
    costZar: { label: "Cost (ZAR)", color: "var(--chart-3)" },
  };
  const aiDaily = (ai?.daily ?? []).map((day) => ({ ...day, costZar: usdToZar(day.costUsd) }));
  const modelRows = (ai?.byModel ?? []).slice(0, 8);
  const modelConfig: ChartConfig = {
    requests: { label: "Requests", color: "var(--chart-1)" },
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Control centre
          </span>
          <h1 className="font-heading text-2xl font-medium">Analytics</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DAY_RANGES.map((range) => (
            <Button
              key={range}
              size="sm"
              variant={days === range ? "default" : "outline"}
              onClick={() => setDays(range)}
            >
              {range} days
            </Button>
          ))}
          <div className="ml-1 flex flex-col items-end font-mono text-[11px] text-muted-foreground">
            <span>{formatTime(snapshot.generatedAt)}</span>
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

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not refresh analytics</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className={cn("grid gap-4 sm:grid-cols-2", ai ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
        <Stat
          icon={Inbox}
          label="POPIA open"
          value={formatInt(popia.open)}
          hint={`${formatInt(popia.overdue)} overdue · ${formatInt(popia.dueSoon)} due in 72 h`}
          tone={popia.overdue > 0 ? "red" : "blue"}
        />
        <Stat
          icon={TriangleAlert}
          label="POPIA overdue"
          value={formatInt(popia.overdue)}
          hint="past the statutory due date"
          tone="amber"
        />
        <Stat
          icon={Activity}
          label="POPIA received"
          value={formatInt(popia.received)}
          hint={`${formatInt(popia.closed)} closed in this period`}
          tone="blue"
        />
        <Stat
          icon={Clock}
          label="Media awaiting review"
          value={formatInt(media.awaitingReview)}
          hint={`${formatInt(media.open)} open across the desk`}
          tone="amber"
        />
        <Stat
          icon={CircleAlert}
          label="Information gaps"
          value={formatInt(media.informationGaps)}
          hint="no grounded source, parked for a human"
          tone="red"
        />
        <Stat
          icon={BadgeCheck}
          label="Media approved"
          value={formatInt(media.approved)}
          hint={
            media.approvalRate === null
              ? "nothing decided in this period"
              : `${percent.format(media.approvalRate)} approval rate`
          }
          tone="green"
        />
        {ai ? (
          <Stat
            icon={Sparkles}
            label="AI requests"
            value={formatInt(ai.requests)}
            hint={`${formatInt(ai.toolCalls)} tool calls · ${formatInt(ai.errorCount)} errors`}
            tone="slate"
          />
        ) : null}
        {ai ? (
          <Stat
            icon={Banknote}
            label="AI spend"
            value={formatCost(ai.costUsd)}
            hint={`${formatInt(ai.totalTokens)} tokens · ${formatMs(ai.avgDurationMs)} avg`}
            tone="slate"
          />
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Intake over time"
          description="Requests received per day across the desks."
        >
          <ChartContainer config={intakeConfig} className="h-[320px] w-full">
            <AreaChart data={intakeData} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="intake-popia" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-popia)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-popia)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="intake-media" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-media)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-media)" stopOpacity={0.02} />
                </linearGradient>
                {ai ? (
                  <linearGradient id="intake-ai" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-ai)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-ai)" stopOpacity={0.02} />
                  </linearGradient>
                ) : null}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tickFormatter={shortDate}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(value) => shortDate(String(value))}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                type="monotone"
                dataKey="popia"
                stroke="var(--color-popia)"
                strokeWidth={2}
                fill="url(#intake-popia)"
              />
              <Area
                type="monotone"
                dataKey="media"
                stroke="var(--color-media)"
                strokeWidth={2}
                fill="url(#intake-media)"
              />
              {ai ? (
                <Area
                  type="monotone"
                  dataKey="ai"
                  stroke="var(--color-ai)"
                  strokeWidth={2}
                  fill="url(#intake-ai)"
                />
              ) : null}
            </AreaChart>
          </ChartContainer>
        </Panel>

        <Panel
          title="POPIA backlog"
          description={`Where the ${formatInt(backlogTotal)} all-time cases sit today.`}
        >
          {backlogRows.length === 0 ? (
            <EmptyChart>No cases yet.</EmptyChart>
          ) : (
            <>
              <ChartContainer config={backlogConfig} className="mx-auto aspect-square h-[230px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
                  <Pie
                    data={backlogRows}
                    dataKey="count"
                    nameKey="key"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {backlogRows.map((row) => (
                      <Cell key={row.key} fill={STATUS_COLORS[row.key]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <StatusList
                rows={backlogRows}
                formatLabel={(key) => POPIA_REQUEST_STATUS_LABELS[key as PopiaRequestStatus]}
              />
            </>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Turnaround" description="How fast each desk closes work this period.">
          <dl className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <dt className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                POPIA resolution
              </dt>
              <dd className="text-3xl font-medium tabular-nums">
                {formatHours(popia.avgResolutionHours)}
              </dd>
              <dd className="text-xs text-muted-foreground">average from receipt to closure</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                Media review
              </dt>
              <dd className="text-3xl font-medium tabular-nums">
                {formatHours(media.avgReviewHours)}
              </dd>
              <dd className="text-xs text-muted-foreground">average from receipt to approval</dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                Media approval rate
              </dt>
              <dd className="text-3xl font-medium tabular-nums">
                {media.approvalRate === null ? "—" : percent.format(media.approvalRate)}
              </dd>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-chart-2"
                  style={{ width: `${(media.approvalRate ?? 0) * 100}%` }}
                />
              </div>
              <dd className="text-xs text-muted-foreground">
                {formatInt(media.approved)} approved · {formatInt(media.rejected)} rejected
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="POPIA by right" description="What requesters asked for this period.">
          <ChartContainer config={{}} className="h-[260px] w-full">
            <BarChart data={typeRows} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="key"
                tickLine={false}
                axisLine={false}
                tickFormatter={(key) => POPIA_TYPE_SHORT[key as PopiaRequestType] ?? String(key)}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(key) => POPIA_REQUEST_TYPE_LABELS[key as PopiaRequestType]}
                  />
                }
              />
              <Bar dataKey="count" radius={4}>
                {typeRows.map((row, index) => (
                  <Cell key={row.key} fill={`var(--chart-${(index % 5) + 1})`} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </Panel>

        <Panel title="Media pipeline" description="Requests by status this period.">
          <ChartContainer config={{}} className="h-[260px] w-full">
            <BarChart
              data={pipelineRows}
              layout="vertical"
              margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="key"
                width={132}
                tickLine={false}
                axisLine={false}
                tickFormatter={(key) =>
                  MEDIA_REQUEST_STATUS_LABELS[key as MediaRequestStatus] ?? String(key)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(key) => MEDIA_REQUEST_STATUS_LABELS[key as MediaRequestStatus]}
                  />
                }
              />
              <Bar dataKey="count" radius={4}>
                {pipelineRows.map((row) => (
                  <Cell key={row.key} fill={STATUS_COLORS[row.key]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </Panel>
      </div>

      {ai ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title="AI tokens and cost"
            description="Daily token volume with spend overlaid."
          >
            <ChartContainer config={aiConfig} className="h-[300px] w-full">
              <ComposedChart data={aiDaily} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="key"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  tickFormatter={shortDate}
                />
                <YAxis
                  yAxisId="tokens"
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(value: number) => compact.format(value)}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={76}
                  tickFormatter={(value: number) => formatZarCompact(value)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => shortDate(String(value))}
                      formatter={(value, name) =>
                        name === "Cost (ZAR)"
                          ? formatZar(Number(value))
                          : Number(value).toLocaleString("en-ZA")
                      }
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  yAxisId="tokens"
                  dataKey="totalTokens"
                  name="Tokens"
                  fill="var(--color-totalTokens)"
                  radius={4}
                />
                <Line
                  yAxisId="cost"
                  dataKey="costZar"
                  name="Cost (ZAR)"
                  stroke="var(--color-costZar)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
          </Panel>

          <Panel title="AI by model" description="Model calls this period, busiest first.">
            {modelRows.length === 0 ? (
              <EmptyChart>No model calls in this period.</EmptyChart>
            ) : (
              <ChartContainer config={modelConfig} className="h-[300px] w-full">
                <BarChart
                  data={modelRows}
                  layout="vertical"
                  margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="key"
                    width={180}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="requests" radius={4}>
                    {modelRows.map((row, index) => (
                      <Cell key={row.key} fill={`var(--chart-${(index % 5) + 1})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </Panel>
        </div>
      ) : null}
    </section>
  );
}
