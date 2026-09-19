import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";

import { Markdown } from "@voltedge/ai-chat";
import {
  TREND_DIRECTION_LABELS,
  type AnalysisBrief,
  type BriefNarrativeItem,
  type BriefStatistic,
  type BriefTrend,
} from "@voltedge/brief-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voltedge/ui";
import { DocumentPreview, SourceReferences } from "@voltedge/media-ui";

import { ApiError, getAnalysisBrief } from "../lib/briefs-api.ts";
import { formatTime } from "../lib/format.ts";

function NarrativeSection({
  title,
  description,
  items,
  onOpenSource,
}: {
  title: string;
  description: string;
  items: BriefNarrativeItem[];
  onOpenSource: (source: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="flex flex-col gap-1">
            <span className="text-sm font-medium">{item.title}</span>
            <Markdown className="text-sm text-muted-foreground" onOpenDocument={onOpenSource}>
              {item.detail}
            </Markdown>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StatisticTable({
  statistics,
  onOpenSource,
}: {
  statistics: BriefStatistic[];
  onOpenSource: (source: string) => void;
}) {
  if (statistics.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Key statistics</CardTitle>
        <CardDescription>Published figures the brief stands behind.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Statistic</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Context</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statistics.map((statistic, index) => (
              <TableRow key={`${statistic.label}-${index}`}>
                <TableCell className="font-medium">{statistic.label}</TableCell>
                <TableCell className="font-mono text-sm whitespace-nowrap">
                  {statistic.value}
                  {statistic.unit ? ` ${statistic.unit}` : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">{statistic.period ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {statistic.context ? (
                    <Markdown className="text-sm" onOpenDocument={onOpenSource}>
                      {statistic.context}
                    </Markdown>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TrendList({
  trends,
  onOpenSource,
}: {
  trends: BriefTrend[];
  onOpenSource: (source: string) => void;
}) {
  if (trends.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trends</CardTitle>
        <CardDescription>Directions the selected content records.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {trends.map((trend, index) => (
          <div key={`${trend.title}-${index}`} className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              {trend.title}
              <Badge variant="outline" className="font-mono text-[10px] tracking-wide uppercase">
                {TREND_DIRECTION_LABELS[trend.direction]}
              </Badge>
            </span>
            <Markdown className="text-sm text-muted-foreground" onOpenDocument={onOpenSource}>
              {trend.detail}
            </Markdown>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * One saved brief: the cited analysis, its verification result and the sources
 * behind every claim. Citations open the indexed document beside the brief.
 */
export function AnalysisBriefView({ id }: { id: string }) {
  const [brief, setBrief] = useState<AnalysisBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { brief: loaded } = await getAnalysisBrief(id);
      setBrief(loaded);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load the brief.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading brief…
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert variant="destructive">
          <AlertTitle>Brief unavailable</AlertTitle>
          <AlertDescription>{error ?? "The brief could not be found."}</AlertDescription>
        </Alert>
        <Button variant="outline" render={<a href="/analysis" />}>
          <ArrowLeft /> Back to analysis
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" render={<a href="/analysis" />}>
          <ArrowLeft /> Back to analysis
        </Button>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {brief.verification.status === "verified" ? (
            <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 /> Numbers traced
            </Badge>
          ) : brief.verification.status === "unverified" ? (
            <Badge variant="destructive">
              <ShieldAlert /> Unverified figures
            </Badge>
          ) : (
            <Badge variant="outline">Verification skipped</Badge>
          )}
          <span>{brief.createdByLabel}</span>
          <span>{formatTime(brief.createdAt)}</span>
          {brief.model ? <span className="font-mono">{brief.model}</span> : null}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-xl font-medium">{brief.title}</h1>
        <div className="flex flex-wrap gap-2">
          {brief.sources.map((source) => (
            <Badge key={source} variant="secondary" className="font-mono text-[10px]">
              {source}
            </Badge>
          ))}
        </div>
        {brief.focus ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Focus:</span> {brief.focus}
          </p>
        ) : null}
      </div>

      {brief.verification.status === "unverified" && brief.verification.unverified.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Some figures could not be traced to a source</AlertTitle>
          <AlertDescription>
            Check before use: {brief.verification.unverified.join(", ")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>The communications read of the selected content.</CardDescription>
        </CardHeader>
        <CardContent>
          <Markdown className="text-sm" onOpenDocument={setPreviewSource}>
            {brief.content.summary}
          </Markdown>
        </CardContent>
      </Card>

      <NarrativeSection
        title="Key findings"
        description="The results a media audience should take away."
        items={brief.content.keyFindings}
        onOpenSource={setPreviewSource}
      />

      <StatisticTable statistics={brief.content.statistics} onOpenSource={setPreviewSource} />

      <TrendList trends={brief.content.trends} onOpenSource={setPreviewSource} />

      <NarrativeSection
        title="Insights"
        description="What the results imply for the current communications cycle."
        items={brief.content.insights}
        onOpenSource={setPreviewSource}
      />

      <NarrativeSection
        title="Context"
        description="Methodology, definitions and scope behind the numbers."
        items={brief.content.context}
        onOpenSource={setPreviewSource}
      />

      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <CardDescription>Every passage and published table the brief cites.</CardDescription>
        </CardHeader>
        <CardContent>
          <SourceReferences sources={brief.references} onOpenSource={setPreviewSource} />
        </CardContent>
      </Card>

      <DocumentPreview
        source={previewSource}
        open={previewSource !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewSource(null);
        }}
      />
    </div>
  );
}
