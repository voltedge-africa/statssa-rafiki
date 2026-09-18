import { env } from "./env.ts";

/**
 * The public chat portal runs alongside this site (port 3003 in development), so derive its
 * URL from the hostname the browser used. Set VITE_PUBLIC_PORTAL_URL to override in
 * production or behind a proxy.
 */
export function publicPortalUrl(): string {
  if (env.publicPortalUrl) return env.publicPortalUrl;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3003`;
}
