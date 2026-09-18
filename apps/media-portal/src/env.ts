/**
 * Client (browser) environment. Values come from Vite, so they must be VITE_-prefixed and
 * are inlined at build time (see apps/media-portal/.env.example).
 */
export const env = {
  /** Optional. URL of the public website; derived from the browser host when unset. */
  websiteUrl: import.meta.env.VITE_WEBSITE_URL,
  /** Optional. URL of the public chat portal; derived from the browser host when unset. */
  publicPortalUrl: import.meta.env.VITE_PUBLIC_PORTAL_URL,
  /** Optional. URL of the Staff/Admin control centre; derived from the browser host when unset. */
  controlCentreUrl: import.meta.env.VITE_CONTROL_CENTRE_URL,
} as const;

/** The public website runs alongside this app on port 3002 in development. */
export function websiteUrl(): string {
  if (env.websiteUrl) return env.websiteUrl;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3002`;
}

/** The public chat portal runs alongside this app on port 3003 in development. */
export function publicPortalUrl(): string {
  if (env.publicPortalUrl) return env.publicPortalUrl;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3003`;
}

/** The control centre runs alongside this app on port 3006 in development. */
export function controlCentreUrl(): string {
  if (env.controlCentreUrl) return env.controlCentreUrl;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3006`;
}

/** The reviewer desk for Staff and Admin accounts. */
export function reviewDeskUrl(): string {
  return `${controlCentreUrl().replace(/\/+$/, "")}/media`;
}
