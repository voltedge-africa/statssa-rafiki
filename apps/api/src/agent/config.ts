import { optional, orDefault } from "../env.ts";

export const PROVIDER = {
  id: "opencode-go",
  label: "OpenCode Go",
  envKey: "OPENCODE_API_KEY",
} as const;

/** Optional, default muse-spark-1.3-contributor. */
export const MODEL = orDefault("PI_MODEL", "muse-spark-1.3-contributor");

/**
 * Optional, default deepseek-v4.1-flash. Small, fast model used only to turn a grounded answer into
 * a final, naturally-worded reply (see AgentService.formatReply). It is given no tools and no data
 * access — only the text of an answer that the main agent already produced.
 */
export const WRAPPER_MODEL = orDefault("PI_WRAPPER_MODEL", "deepseek-v4.1-flash");

/**
 * Compatibility map for model ids the provider serves but pi-ai's bundled catalog has not listed
 * yet. `Models.getModel` only searches that static catalog, so an unlisted id cannot be selected
 * directly; `AgentService.resolveModelForId` clones the named catalogued sibling instead. This is
 * safe because a request is routed to the provider by `model.provider` and the provider sends
 * `model.id` — the catalog entry only supplies the request shape (api, base URL, compat).
 *
 * `deepseek-v4.1-flash` is on the provider (a newer, separate model from `deepseek-v4-flash`) but
 * absent from the catalog as of @earendil-works/pi-ai 0.85.1 (the latest published).
 */
export const MODEL_ALIASES: Record<string, string> = {
  "deepseek-v4.1-flash": "deepseek-v4-flash",
};

/**
 * Optional, defaults to PI_WRAPPER_MODEL. Small model used by the input-side query normalizer
 * (AgentService.normalizeQuestion): it maps informal wording onto the knowledge base's vocabulary
 * and flags clearly out-of-scope questions. Given no tools and no data, only public coverage
 * metadata and the user's question.
 */
export const NORMALIZER_MODEL = orDefault("PI_NORMALIZER_MODEL", WRAPPER_MODEL);

/** The agent is unavailable until OPENCODE_API_KEY is set. */
export function hasProviderKey(): boolean {
  return Boolean(optional(PROVIDER.envKey));
}
