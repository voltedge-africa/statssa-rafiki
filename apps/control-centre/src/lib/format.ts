/**
 * Shared display formatters for the control-centre desk views, so the telemetry and
 * governance surfaces never drift on how a token count or a latency is rendered.
 * Money is always rand: provider costs are recorded in USD and converted once, here.
 */

import { env } from "./env.ts";

const integerFormat = new Intl.NumberFormat("en-ZA");

// Rand in accounting convention: grouped thousands, comma decimals and negatives in
// parentheses, per `currencySign: "accounting"`.
const zarFormat = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  currencySign: "accounting",
});

// Model spend per day is often sub-cent; four decimals keep it from collapsing to R 0,00.
const zarPreciseFormat = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  currencySign: "accounting",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const zarCompactFormat = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatInt(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : integerFormat.format(value);
}

/** Convert the provider's USD cost to rand at the configured display rate. */
export function usdToZar(value: number): number {
  return value * env.zarPerUsd;
}

/** A rand amount in accounting format: `R 1 234,56`, `(R 1 234,56)` when negative. */
export function formatZar(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value !== 0 && Math.abs(value) < 0.01
    ? zarPreciseFormat.format(value)
    : zarFormat.format(value);
}

/** Rand for chart axes, where a full amount would not fit. */
export function formatZarCompact(value: number): string {
  return zarCompactFormat.format(value);
}

/**
 * Provider cost (recorded in USD) rendered as rand. The only place the conversion
 * happens, so no view can accidentally show a bare USD figure.
 */
export function formatCost(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : formatZar(usdToZar(value));
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
