import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

// Bun loads apps/auth/.env automatically. This makes the same values visible to tools that run
// under Node (drizzle-kit) and keeps loading in one place. Real environment values win.
if (existsSync(".env")) {
  loadEnvFile(".env");
}

/** Read an optional variable. Unset and blank both return undefined. */
export function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Read an optional variable, falling back when unset or blank. */
export function orDefault(name: string, fallback: string): string {
  return optional(name) ?? fallback;
}

/** Read an optional number, falling back when unset; rejects non-numeric values. */
export function numberOrDefault(name: string, fallback: number): number {
  const raw = optional(name);
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}".`);
  }
  return value;
}

/** Read an optional comma-separated list. Unset or blank returns an empty array. */
export function list(name: string): string[] {
  return (optional(name) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
