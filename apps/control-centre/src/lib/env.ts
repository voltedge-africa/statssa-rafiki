/**
 * Client (browser) environment. Values come from Vite, so they must be VITE_-prefixed and
 * are inlined at build time (see apps/control-centre/.env.example).
 */
export const env = {
  /** Optional. URL of the public website; derived from the browser host when unset. */
  websiteUrl: import.meta.env.VITE_WEBSITE_URL,
} as const;

/** The public website runs alongside this app on port 3002 in development. */
export function websiteUrl(): string {
  if (env.websiteUrl) return env.websiteUrl;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3002`;
}
