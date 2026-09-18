const ALLOWED_HOSTS = new Set(["opencode.ai"]);

/**
 * Fetch wrapper that only permits the OpenCode API host.
 * Everything else in the agent is local, so any other outbound request is a bug.
 */
export const guardedFetch: typeof fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`Offline policy: blocked outbound request to ${url.hostname}`);
  }
  return fetch(input, init);
};
