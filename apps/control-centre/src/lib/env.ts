import { appUrlFromOrigin } from "@voltedge/auth-contract";

/**
 * Client (browser) environment. Values come from Vite, so they must be VITE_-prefixed and
 * are inlined at build time (see apps/control-centre/.env.example).
 */
export const env = {
  /** Optional. URL of the public website; derived from the browser host when unset. */
  websiteUrl: import.meta.env.VITE_WEBSITE_URL,
  /** Optional. URL of the media room; derived from the browser host when unset. */
  mediaPortalUrl: import.meta.env.VITE_MEDIA_PORTAL_URL,
} as const;

/** The public website runs alongside this app on port 3002 in development. */
export function websiteUrl(): string {
  return env.websiteUrl ?? appUrlFromOrigin(window.location.origin, "website");
}

/** The media room runs alongside this app on port 3004 in development. */
export function mediaPortalUrl(): string {
  return env.mediaPortalUrl ?? appUrlFromOrigin(window.location.origin, "mediaPortal");
}
