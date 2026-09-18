import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@openauthjs/openauth/client";
import type { Plugin } from "vite";
import {
  appUrlFromOrigin,
  SESSION_ACCESS_COOKIE,
  SESSION_REFRESH_COOKIE,
  workspaceForRole,
  type Role,
  subjects,
  type AuthUser,
} from "@voltedge/auth-contract";
import type { ServerEnv } from "./env.ts";

const CLIENT_ID = "website";
const ACCESS_COOKIE = SESSION_ACCESS_COOKIE;
const REFRESH_COOKIE = SESSION_REFRESH_COOKIE;
const CHALLENGE_COOKIE = "website_challenge";

// Browser calls to this prefix are proxied to the API with the session's access token attached,
// so tokens stay in httpOnly cookies and the browser never talks to the API cross-origin.
const API_PREFIX = "/api/popia";

// The client app handles these pages. `/press`, `/staff` and `/admin` are not pages any more:
// the server redirects them to the app the signed-in user belongs in. Anything else that is
// navigated to (Accept: text/html) gets a real 404 instead of silently falling through.
const SPA_ROUTES = new Set(["/", "/popia", "/popia/track", "/popia/my"]);

// Legacy role paths kept as signposts so old bookmarks still land somewhere sensible.
const ROLE_ROUTES = new Set(["/press", "/staff", "/admin"]);

function normalizePath(path: string) {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function wantsHtml(req: IncomingMessage) {
  return (req.headers.accept ?? "").includes("text/html");
}

// Vite internals (/@vite, /@fs, ...) and anything with a file extension are served by Vite,
// never treated as an app page.
function isAssetRequest(path: string) {
  if (path.startsWith("/@")) return true;
  const last = normalizePath(path).split("/").pop() ?? "";
  return last.includes(".");
}

function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (char) => replacements[char] ?? char);
}

function notFoundPage(path: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>404 · Not found</title>
    <style>
      :root {
        --text: #6b6375;
        --text-h: #08060d;
        --bg: #fff;
        --border: #e5e4e7;
        --accent: #aa3bff;
        color-scheme: light dark;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --text: #9ca3af;
          --text-h: #f3f4f6;
          --bg: #16171d;
          --border: #2e303a;
          --accent: #c084fc;
        }
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
        font: 18px/145% system-ui, "Segoe UI", Roboto, sans-serif;
        color: var(--text);
        background: var(--bg);
      }
      main {
        max-width: 26rem;
        border: 1px solid var(--border);
        padding: 2rem;
        text-align: center;
      }
      h1 {
        margin: 0 0 1rem;
        font-size: 1.5rem;
        color: var(--text-h);
      }
      p {
        margin: 0 0 0.5rem;
      }
      code {
        color: var(--text-h);
      }
      a {
        color: var(--accent);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>404</h1>
      <p>No page at <code>${escapeHtml(path)}</code>.</p>
      <p><a href="/">Go home</a></p>
    </main>
  </body>
</html>`;
}

function requestProto(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-proto"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? "http";
}

function requestHostname(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-host"];
  const host =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? req.headers.host ?? "localhost";
  return host.split(",")[0].trim().split(":")[0];
}

// The public origin the browser used (works for localhost, a tailnet hostname, or a proxy).
function requestOrigin(req: IncomingMessage) {
  return `${requestProto(req)}://${req.headers.host ?? "localhost"}`;
}

// The auth server runs alongside this app on AUTH_PORT, so reach it through the same hostname
// the browser used. This keeps the flow working locally and from another machine over a tailnet
// without hardcoding localhost. Set VITE_AUTH_ISSUER to override (eg. an HTTPS proxy).
function issuerFor(req: IncomingMessage, env: ServerEnv) {
  if (env.authIssuer) return env.authIssuer;
  return `${requestProto(req)}://${requestHostname(req)}:${env.authPort}`;
}

// Where a signed-in user belongs: Press read the media room, Staff and Admin run the control
// centre. Explicit VITE_*_URL wins; otherwise it is derived from the request host (eg. the
// same hostname on port 3004 or 3006).
function workspaceDestination(role: Role, req: IncomingMessage, env: ServerEnv) {
  const workspace = workspaceForRole(role);
  const configured = workspace === "mediaPortal" ? env.mediaPortalUrl : env.controlCentreUrl;
  return configured ?? appUrlFromOrigin(requestOrigin(req), workspace);
}

const clients = new Map<string, ReturnType<typeof createClient>>();

function getClient(req: IncomingMessage, env: ServerEnv) {
  const issuer = issuerFor(req, env);
  let client = clients.get(issuer);
  if (!client) {
    client = createClient({ clientID: CLIENT_ID, issuer });
    clients.set(issuer, client);
  }
  return client;
}

function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly?: boolean; maxAge?: number; sameSite?: "Lax" | "Strict" | "None" } = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=/`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

function clearCookie(name: string) {
  return serializeCookie(name, "", { maxAge: 0, sameSite: "Lax" });
}

function getCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function redirect(res: ServerResponse, location: string, cookies: string[] = []) {
  res.statusCode = 302;
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.setHeader("Location", location);
  res.end();
}

function sessionCookies(tokens: { access: string; refresh: string }): string[] {
  return [
    serializeCookie(ACCESS_COOKIE, tokens.access, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "Lax",
    }),
    serializeCookie(REFRESH_COOKIE, tokens.refresh, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "Lax",
    }),
  ];
}

/**
 * Resolve the session from the request cookies, refreshing the access token when needed.
 * Returns the verified user and a currently valid access token, or `null` when anonymous.
 */
async function resolveSession(
  req: IncomingMessage,
  env: ServerEnv,
  res: ServerResponse,
): Promise<{ user: AuthUser; token: string } | null> {
  const access = getCookie(req.headers.cookie, ACCESS_COOKIE);
  if (!access) return null;

  const refresh = getCookie(req.headers.cookie, REFRESH_COOKIE);
  const verified = await getClient(req, env).verify(
    subjects,
    access,
    refresh ? { refresh } : undefined,
  );
  if (verified.err) return null;

  if (verified.tokens) res.setHeader("Set-Cookie", sessionCookies(verified.tokens));
  return {
    user: verified.subject.properties,
    token: verified.tokens?.access ?? access,
  };
}

async function readBody(req: IncomingMessage): Promise<string | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Forward an `/api/popia/*` call to the API, attaching the session token when there is one. */
async function proxy(req: IncomingMessage, res: ServerResponse, env: ServerEnv): Promise<void> {
  const url = new URL(req.url ?? "/", requestOrigin(req));
  const suffix = url.pathname.slice(API_PREFIX.length) || "/";
  const target = `${env.apiBase}/popia${suffix}${url.search}`;

  const session = await resolveSession(req, env, res);
  const headers: Record<string, string> = {};
  const contentType = req.headers["content-type"];
  if (contentType) headers["content-type"] = contentType;
  if (session) headers.authorization = `Bearer ${session.token}`;
  // The API derives the auth issuer from the hostname the browser used, the same way it
  // does for direct browser calls (see apps/api/src/auth/issuer.ts). Without this header it
  // would reconstruct the issuer from the proxy target host, which mismatches the token's
  // iss claim when the app runs behind a proxy or in containers.
  if (req.headers.host) headers["x-forwarded-host"] = req.headers.host;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: await readBody(req),
    });
    res.statusCode = upstream.status;
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) res.setHeader("Content-Type", upstreamType);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    sendJson(res, 502, { message: "The POPIA API is unreachable. Try again shortly." });
  }
}

async function handle(env: ServerEnv, req: IncomingMessage, res: ServerResponse, next: () => void) {
  const path = (req.url ? new URL(req.url, requestOrigin(req)).pathname : "") || "";

  if (path.startsWith(API_PREFIX)) {
    await proxy(req, res, env);
    return;
  }

  if (path === "/auth/login") {
    const redirectURI = `${requestOrigin(req)}/callback`;
    const { url, challenge } = await getClient(req, env).authorize(redirectURI, "code", {
      provider: "password",
      pkce: true,
    });
    redirect(res, url, [
      serializeCookie(CHALLENGE_COOKIE, JSON.stringify(challenge), {
        httpOnly: true,
        maxAge: 600,
        sameSite: "Lax",
      }),
    ]);
    return;
  }

  if (path === "/callback") {
    const params = req.url
      ? new URL(req.url, requestOrigin(req)).searchParams
      : new URLSearchParams();
    const code = params.get("code");
    const failed = params.get("error");
    if (failed || !code) {
      redirect(res, "/?error=sign_in_failed", [clearCookie(CHALLENGE_COOKIE)]);
      return;
    }

    const raw = getCookie(req.headers.cookie, CHALLENGE_COOKIE);
    const challenge = raw ? (JSON.parse(raw) as { verifier?: string }) : {};
    const exchanged = await getClient(req, env).exchange(
      code,
      `${requestOrigin(req)}/callback`,
      challenge.verifier,
    );
    if (exchanged.err) {
      redirect(res, "/?error=sign_in_failed", [clearCookie(CHALLENGE_COOKIE)]);
      return;
    }

    const verified = await getClient(req, env).verify(subjects, exchanged.tokens.access, {
      refresh: exchanged.tokens.refresh,
    });
    if (verified.err) {
      redirect(res, "/?error=sign_in_failed", [clearCookie(CHALLENGE_COOKIE)]);
      return;
    }

    const tokens = verified.tokens ?? exchanged.tokens;
    const role = verified.subject.properties.role;
    const destination = workspaceDestination(role, req, env);
    redirect(res, destination, [...sessionCookies(tokens), clearCookie(CHALLENGE_COOKIE)]);
    return;
  }

  if (path === "/api/session") {
    const session = await resolveSession(req, env, res);
    if (!session) {
      sendJson(res, 401, { user: null });
      return;
    }
    sendJson(res, 200, { user: session.user });
    return;
  }

  if (path === "/auth/logout" && req.method === "POST") {
    res.setHeader("Set-Cookie", [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)]);
    sendJson(res, 200, { user: null });
    return;
  }

  if (wantsHtml(req) && !isAssetRequest(path)) {
    const normalized = normalizePath(path);
    const canonical = normalized.toLowerCase();

    if (ROLE_ROUTES.has(canonical)) {
      // `/press`, `/staff` and `/admin` are signposts to the app the user belongs in.
      if (normalized !== canonical) {
        redirect(res, canonical);
        return;
      }
      const session = await resolveSession(req, env, res);
      if (!session) {
        redirect(res, "/auth/login");
        return;
      }
      redirect(res, workspaceDestination(session.user.role, req, env));
      return;
    }

    // Browsers' address bars autocomplete to a stored casing (eg. /Popia). Redirect to the
    // canonical lowercase route so the URL bar settles on /popia etc.
    if (SPA_ROUTES.has(canonical) && normalized !== canonical) {
      const query = req.url ? new URL(req.url, requestOrigin(req)).search : "";
      redirect(res, `${canonical}${query}`);
      return;
    }
    if (!SPA_ROUTES.has(normalized)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(notFoundPage(path));
      return;
    }
  }

  next();
}

export function authServerPlugin(env: ServerEnv): Plugin {
  return {
    name: "website-auth-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(env, req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(env, req, res, next);
      });
    },
  };
}
