/**
 * Client (browser) environment. Values come from Vite, so they must be VITE_-prefixed and
 * are inlined at build time (see apps/public-portal/.env.example).
 */
export const env = {
  /** Optional. Base URL of the Rafiki agent API; defaults to the local API. */
  apiBase: import.meta.env.VITE_API_BASE || "http://localhost:3002",
} as const;
