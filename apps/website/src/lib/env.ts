/**
 * Client (browser) environment. Values come from Vite, so they must be VITE_-prefixed and
 * are inlined at build time (see apps/website/.env.example).
 */
export const env = {
  /** Optional. URL of the public chat portal; derived from the browser host when unset. */
  publicPortalUrl: import.meta.env.VITE_PUBLIC_PORTAL_URL,
  /** Optional. URL of the media room (Press workspace); derived from the browser host when unset. */
  mediaPortalUrl: import.meta.env.VITE_MEDIA_PORTAL_URL,
  /** Optional. URL of the control centre (Staff/Admin workspace); derived from the host when unset. */
  controlCentreUrl: import.meta.env.VITE_CONTROL_CENTRE_URL,
} as const;
