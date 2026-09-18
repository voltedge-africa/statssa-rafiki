interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

export interface IssuerOptions {
  authPort: string;
  override?: string;
}

function header(request: RequestLike, name: string) {
  const value = request.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
}

/**
 * The auth server runs alongside this API, so reach it through the same hostname the caller
 * used. This keeps token verification working locally and from another machine over a tailnet
 * without hardcoding localhost. AUTH_ISSUER overrides it (required in production).
 */
export function issuerFor(request: RequestLike, options: IssuerOptions): string {
  if (options.override) return options.override;

  const proto = header(request, "x-forwarded-proto") ?? "http";
  const host = header(request, "x-forwarded-host") ?? header(request, "host") ?? "localhost";
  const hostname = host.split(":")[0];

  return `${proto}://${hostname}:${options.authPort}`;
}
