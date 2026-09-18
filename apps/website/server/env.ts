export interface EnvSource {
  readonly [name: string]: string | undefined;
}

export interface ServerEnv {
  /** Port the issuer listens on. Default 3000. */
  authPort: string;
  /** Explicit issuer URL. When unset, the issuer is derived from the request host. */
  authIssuer?: string;
  /** Base URL of the Rafiki API. Default http://localhost:3001. */
  apiBase: string;
  /** Explicit media room URL. When unset, it is derived from the request host on port 3004. */
  mediaPortalUrl?: string;
  /** Explicit control centre URL. When unset, it is derived from the request host on port 3006. */
  controlCentreUrl?: string;
}

/**
 * Read the server-side variables the auth plugin needs. Vite exposes .env values through
 * `loadEnv`, so this takes an explicit source (see vite.config.ts) instead of process.env.
 */
export function readServerEnv(source: EnvSource): ServerEnv {
  const optional = (name: string) => source[name]?.trim() || undefined;

  return {
    authPort: optional("AUTH_PORT") ?? "3000",
    authIssuer: optional("VITE_AUTH_ISSUER"),
    apiBase: (optional("VITE_API_BASE") ?? "http://localhost:3001").replace(/\/+$/, ""),
    mediaPortalUrl: optional("VITE_MEDIA_PORTAL_URL")?.replace(/\/+$/, ""),
    controlCentreUrl: optional("VITE_CONTROL_CENTRE_URL")?.replace(/\/+$/, ""),
  };
}
