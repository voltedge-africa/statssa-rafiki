import { ChevronRightIcon } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@voltedge/ui";
import type { RecordedSpan, TelemetrySummary } from "@voltedge/agent-contract";
import { formatCost, formatDuration, formatMs, formatValue } from "../lib/format.ts";

export interface TelemetryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spans: RecordedSpan[];
  summary: TelemetrySummary;
  connected: boolean;
  onClear: () => void;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 p-3">
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </Card>
  );
}

function SpanRow({ span }: { span: RecordedSpan }) {
  const attributes = Object.entries(span.attributes);
  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 p-2.5 text-left">
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="flex-1 truncate font-mono text-xs text-foreground">{span.name}</span>
        {span.status === "error" && (
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
            error
          </Badge>
        )}
        <span className="font-mono text-[11px] text-muted-foreground">{formatDuration(span)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 border-t px-3 py-2.5">
        {span.errorMessage && (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] text-muted-foreground">error</span>
            <span className="text-xs text-destructive">{span.errorMessage}</span>
          </div>
        )}
        {attributes.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5">
            <span className="break-all font-mono text-[10px] text-muted-foreground">{key}</span>
            <span className="break-all text-xs">{formatValue(value)}</span>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TelemetryPanel({
  open,
  onOpenChange,
  spans,
  summary,
  connected,
  onClear,
}: TelemetryPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-3 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span
              className={
                connected
                  ? "size-2 rounded-full bg-emerald-500"
                  : "size-2 rounded-full bg-destructive"
              }
            />
            Telemetry
          </SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-2 px-4">
          <Metric label="requests" value={String(summary.requests)} />
          <Metric label="tools" value={String(summary.tools)} />
          <Metric label="avg latency" value={formatMs(summary.avgMs)} />
          <Metric label="tokens in" value={summary.tokensIn.toLocaleString()} />
          <Metric label="tokens out" value={summary.tokensOut.toLocaleString()} />
          <Metric label="cost" value={formatCost(summary.cost)} />
        </div>

        <div className="flex items-center justify-between px-4">
          <span className="text-xs text-muted-foreground">{spans.length} spans</span>
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-4">
          {spans.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No spans yet. Send a message to see the agent trace.
            </p>
          ) : (
            <div className="flex flex-col gap-2 pb-4">
              {spans.map((span) => (
                <SpanRow key={span.id} span={span} />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
