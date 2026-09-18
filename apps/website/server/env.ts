export interface EnvSource {
  readonly [name: string]: string | undefined;
}

export interface ServerEnv {
  /** Port the issuer listens on. Default 3001. */
  authPort: string;
  /** Explicit issuer URL. When unset, the issuer is derived from the request host. */
  authIssuer?: string;
}

/**
 * Read the server-side variables the auth plugin needs. Vite exposes .env values through
 * `loadEnv`, so this takes an explicit source (see vite.config.ts) instead of process.env.
 */
export function readServerEnv(source: EnvSource): ServerEnv {
  const optional = (name: string) => source[name]?.trim() || undefined;

  return {
    authPort: optional("AUTH_PORT") ?? "3001",
    authIssuer: optional("VITE_AUTH_ISSUER"),
  };
}
