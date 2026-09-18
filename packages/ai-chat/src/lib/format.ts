export function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

export function formatDuration(span: { settled: boolean; durationMs?: number }): string {
  if (!span.settled || span.durationMs === undefined) return "running";
  return formatMs(span.durationMs);
}

export function formatCost(value: number): string {
  if (!value) return "$0";
  return `$${value < 0.01 ? value.toFixed(6) : value.toFixed(4)}`;
}

export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}
