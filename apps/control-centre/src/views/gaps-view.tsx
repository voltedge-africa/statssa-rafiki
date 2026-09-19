import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Inbox, Search } from "lucide-react";

import {
  GAP_SURFACE_LABELS,
  type GapCategory,
  type GapQuery,
  type GapSummary,
} from "@voltedge/gaps-contract";
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
  Field,
  FieldLabel,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voltedge/ui";

import { Select } from "../components/select.tsx";
import { ApiError, getGapSummary, listGapCategories, listGapQueries } from "../lib/gaps-api.ts";
import { formatInt, formatTime } from "../lib/format.ts";

const DAY_RANGES = [7, 30, 90] as const;

const percent = new Intl.NumberFormat("en-ZA", { style: "percent", maximumFractionDigits: 0 });

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });
}

function errorMessage(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : "Could not load the knowledge-gap log.";
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="gap-0">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
    </Card>
  );
}

/**
 * The knowledge-gap log: every query the approved sources could not answer,
 * clustered by topic so the comms team can see what the public and press are
 * asking that Stats SA does not yet cover.
 */
export function GapsView() {
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<GapSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<GapCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [queries, setQueries] = useState<GapQuery[]>([]);
  const [queriesLoading, setQueriesLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getGapSummary(days));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [days]);

  const loadCategories = useCallback(async () => {
    try {
      const { categories: loaded } = await listGapCategories({ q: search || undefined, limit: 50 });
      setCategories(loaded);
    } catch {
      setCategories([]);
    }
  }, [search]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (!selectedId) {
      setQueries([]);
      return;
    }
    let cancelled = false;
    setQueriesLoading(true);
    listGapQueries(selectedId, { limit: 50 })
      .then(({ queries: loaded }) => {
        if (!cancelled) setQueries(loaded);
      })
      .catch(() => {
        if (!cancelled) setQueries([]);
      })
      .finally(() => {
        if (!cancelled) setQueriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = useMemo(
    () => categories.find((category) => category.id === selectedId) ?? null,
    [categories, selectedId],
  );

  const dailyMax = useMemo(
    () => Math.max(1, ...(summary?.daily.map((day) => day.count) ?? [])),
    [summary],
  );

  if (loading && !summary) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading the gap log…
      </div>
    );
  }

  if (error || !summary) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Gap log unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[70ch] text-sm text-muted-foreground">
          Queries that received no grounded answer because the approved corpus and published tables
          do not cover them. Grouped by topic; no user identities are stored.
        </p>
        <Field className="w-40">
          <FieldLabel htmlFor="gap-days">Window</FieldLabel>
          <Select
            id="gap-days"
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {DAY_RANGES.map((range) => (
              <option key={range} value={range}>
                Last {range} days
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Ungrounded queries"
          value={formatInt(summary.total)}
          hint={`Last ${days} days`}
        />
        <Metric label="Categories" value={formatInt(summary.categories)} />
        <Metric
          label="New categories"
          value={formatInt(summary.newCategories)}
          hint={`First seen in the window`}
        />
        <Metric
          label="Media outlets"
          value={formatInt(summary.topOutlets.length)}
          hint="Outlets behind media gaps"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Gaps per day</CardTitle>
            <CardDescription>Every UTC day in the window, zero-filled.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-1">
              {summary.daily.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.count}`}
                  className="min-w-0 flex-1 rounded-t bg-primary/60 hover:bg-primary"
                  style={{
                    height: `${Math.max(day.count / dailyMax, day.count > 0 ? 0.06 : 0.02) * 100}%`,
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>{summary.daily[0] ? shortDate(summary.daily[0].date) : ""}</span>
              <span>{summary.daily.at(-1) ? shortDate(summary.daily.at(-1)!.date) : ""}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where they come from</CardTitle>
            <CardDescription>Public chat versus the media fact-check desk.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {summary.surfaces.map((surface) => (
              <div key={surface.surface} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{GAP_SURFACE_LABELS[surface.surface]}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatInt(surface.count)}
                    {summary.total === 0
                      ? ""
                      : ` · ${percent.format(surface.count / summary.total)}`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{
                      width: `${summary.total === 0 ? 0 : (surface.count / summary.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top categories</CardTitle>
            <CardDescription>Where the unmet demand concentrates.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ungrounded queries in this window.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {summary.topCategories.map((category) => (
                  <li key={category.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <button
                        type="button"
                        className="truncate text-left font-medium hover:text-primary"
                        onClick={() => setSelectedId(category.id)}
                      >
                        {category.label}
                      </button>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatInt(category.queryCount)}
                        {category.share === null ? "" : ` · ${percent.format(category.share)}`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${(category.share ?? 0) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="self-start">
          <CardHeader className="gap-3">
            <div>
              <CardTitle>Categorised queries</CardTitle>
              <CardDescription>Select a category to read the underlying queries.</CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search categories…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-6 text-sm text-muted-foreground">
                <Inbox className="size-5" />
                {search
                  ? "No categories match that search."
                  : "No ungrounded queries have been logged yet."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Queries</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Surfaces</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow
                      key={category.id}
                      className={`cursor-pointer ${category.id === selectedId ? "bg-accent/40" : ""}`}
                      onClick={() => setSelectedId(category.id)}
                    >
                      <TableCell className="font-medium">{category.label}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatInt(category.queryCount)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTime(category.lastSeen)}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {category.surfaces.map((surface) => (
                            <Badge key={surface} variant="outline" className="text-[10px]">
                              {GAP_SURFACE_LABELS[surface]}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>{selected ? selected.label : "Query drill-down"}</CardTitle>
            <CardDescription>
              {selected
                ? `${formatInt(selected.queryCount)} logged queries in this category.`
                : "Choose a category to see the queries logged against it."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="flex flex-col items-start gap-2 py-6 text-sm text-muted-foreground">
                <CircleAlert className="size-5" />
                Nothing selected yet.
              </div>
            ) : queriesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Loading queries…
              </div>
            ) : queries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No queries recorded for this category.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {queries.map((query) => (
                  <li key={query.id} className="flex flex-col gap-1 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {GAP_SURFACE_LABELS[query.surface]}
                      </Badge>
                      {query.outlet ? (
                        <span className="text-xs font-medium">{query.outlet}</span>
                      ) : null}
                      {query.reference ? (
                        <a
                          href={`/media/${query.reference}`}
                          className="font-mono text-[11px] text-primary hover:underline"
                        >
                          {query.reference}
                        </a>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {query.role ?? "anonymous"} · {formatTime(query.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm">{query.query}</p>
                    {query.reason ? (
                      <p className="text-xs text-muted-foreground">{query.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.topOutlets.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Top outlets behind media gaps</CardTitle>
            <CardDescription>
              Media rooms whose fact-check requests were not grounded.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {summary.topOutlets.map((outlet) => (
              <Badge key={outlet.outlet} variant="outline">
                {outlet.outlet} · {formatInt(outlet.count)}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
