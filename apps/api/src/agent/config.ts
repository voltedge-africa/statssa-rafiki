import { optional, orDefault } from "../env.ts";

export const PROVIDER = {
  id: "opencode-go",
  label: "OpenCode Go",
  envKey: "OPENCODE_API_KEY",
} as const;

/** Optional, default muse-spark-1.3-contributor. */
export const MODEL = orDefault("PI_MODEL", "muse-spark-1.3-contributor");

/** The agent is unavailable until OPENCODE_API_KEY is set. */
export function hasProviderKey(): boolean {
  return Boolean(optional(PROVIDER.envKey));
}
