/**
 * Shared display formatters for the control-centre desk views, so the telemetry and
 * governance surfaces never drift on how a token count or a latency is rendered.
 */

const integerFormat = new Intl.NumberFormat("en-ZA");

export function formatInt(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : integerFormat.format(value);
}

export function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "0 ms";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "medium" });
}
