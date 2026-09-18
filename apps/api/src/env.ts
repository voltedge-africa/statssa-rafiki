import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

// Load apps/api/.env once, before any module reads process.env. Values already present in the
// real environment win: loadEnvFile never overwrites them.
if (existsSync(".env")) {
  loadEnvFile(".env");
}

/** `NODE_ENV`, defaulting to development. */
export const NODE_ENV = orDefault("NODE_ENV", "development");

/** True when `NODE_ENV` is production. */
export const IS_PRODUCTION = NODE_ENV === "production";

/** Read a required variable, failing fast when it is missing or blank. */
export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. See apps/api/.env.example.`);
  }
  return value;
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

/** Read an optional boolean flag. "1", "true" and "yes" (case-insensitive) are true. */
export function flag(name: string): boolean {
  const value = optional(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
