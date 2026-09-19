import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient, type Tokens } from "@openauthjs/openauth/client";
import {
  appUrlFromOrigin,
  SESSION_ACCESS_COOKIE,
  SESSION_REFRESH_COOKIE,
  workspaceForRole,
  type Role,
  subjects,
  type AuthUser,
} from "@voltedge/auth-contract";
import type { Plugin } from "vite";
import type { ServerEnv } from "./env.ts";

const CLIENT_ID = "control-centre";
const ACCESS_COOKIE = SESSION_ACCESS_COOKIE;
const REFRESH_COOKIE = SESSION_REFRESH_COOKIE;
const CHALLENGE_COOKIE = "control_challenge";

// Browser calls to these prefixes are proxied to the API with the session's access token
// attached, so tokens stay in httpOnly cookies and the browser never talks to the API
// cross-origin. `/api/popia` carries the POPIA desk, `/api/media` the media desk,
// `/api/rag` the indexed documents a fact-check reference opens, `/api/analytics` the
// cross-desk dashboard, `/api/analysis` the content-analysis briefs, `/api/gaps` the
// knowledge-gap log and `/api/admin/ai` the Admin-only AI governance telemetry.
const API_PREFIXES: Record<string, string> = {
  "/api/popia": "/popia",
  "/api/media": "/media",
  "/api/rag": "/api/rag",
  "/api/analytics": "/analytics",
  "/api/analysis": "/analysis",
  "/api/gaps": "/gaps",
  "/api/admin/ai": "/admin/ai",
  "/api/admin/governance": "/admin/governance",
};

const ACCESS_MAX_AGE = 60 * 60 * 24 * 30;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 365;

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

function wantsHtml(req: IncomingMessage) {
  return (req.headers.accept ?? "").includes("text/html");
}

// Vite internals (/@vite, /@fs, ...) and anything with a file extension are assets, never pages.
function isAssetRequest(path: string) {
  if (path.startsWith("/@")) return true;
  const last = path.replace(/\/+$/, "").split("/").pop() ?? "";
  return last.includes(".");
}

// The auth server runs alongside this app on AUTH_PORT, so reach it through the same hostname
// the browser used. Set VITE_AUTH_ISSUER to override (eg. an HTTPS proxy).
function issuerFor(req: IncomingMessage, env: ServerEnv) {
  if (env.authIssuer) return env.authIssuer;
  return `${requestProto(req)}://${requestHostname(req)}:${env.authPort}`;
}

// Where a signed-out visitor is sent: the public website, which owns sign-in.
function websiteDestination(req: IncomingMessage, env: ServerEnv) {
  return env.websiteUrl ?? appUrlFromOrigin(requestOrigin(req), "website");
}

// Where a signed-in user belongs when this app is not theirs: Press read the media room; Staff
// and Admin belong here. Explicit VITE_*_URL wins, otherwise derive from the request host.
function workspaceDestination(role: Role, req: IncomingMessage, env: ServerEnv) {
  const workspace = workspaceForRole(role);
  const configured = workspace === "mediaPortal" ? env.mediaPortalUrl : undefined;
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

function sessionCookies(tokens: Tokens): string[] {
  return [
    serializeCookie(ACCESS_COOKIE, tokens.access, {
      httpOnly: true,
      maxAge: ACCESS_MAX_AGE,
      sameSite: "Lax",
    }),
    serializeCookie(REFRESH_COOKIE, tokens.refresh, {
      httpOnly: true,
      maxAge: REFRESH_MAX_AGE,
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

/** Forward an `/api/*` call to the API, attaching the session token when there is one. */
async function proxy(
  req: IncomingMessage,
  res: ServerResponse,
  env: ServerEnv,
  prefix: string,
  upstreamPrefix: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", requestOrigin(req));
  const suffix = url.pathname.slice(prefix.length) || "/";
  const target = `${env.apiBase}${upstreamPrefix}${suffix}${url.search}`;

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
    sendJson(res, 502, { message: "The API is unreachable. Try again shortly." });
  }
}

async function handle(env: ServerEnv, req: IncomingMessage, res: ServerResponse, next: () => void) {
  const path = (req.url ? new URL(req.url, requestOrigin(req)).pathname : "") || "";

  const apiPrefix = Object.keys(API_PREFIXES).find((prefix) => path.startsWith(prefix));
  if (apiPrefix) {
    await proxy(req, res, env, apiPrefix, API_PREFIXES[apiPrefix]);
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
      redirect(res, `${websiteDestination(req, env)}?error=sign_in_failed`, [
        clearCookie(CHALLENGE_COOKIE),
      ]);
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
      redirect(res, `${websiteDestination(req, env)}?error=sign_in_failed`, [
        clearCookie(CHALLENGE_COOKIE),
      ]);
      return;
    }

    const verified = await getClient(req, env).verify(subjects, exchanged.tokens.access, {
      refresh: exchanged.tokens.refresh,
    });
    if (verified.err) {
      redirect(res, `${websiteDestination(req, env)}?error=sign_in_failed`, [
        clearCookie(CHALLENGE_COOKIE),
      ]);
      return;
    }

    const role = verified.subject.properties.role;
    const destination = role === "Press" ? workspaceDestination(role, req, env) : "/";
    redirect(res, destination, [
      ...sessionCookies(verified.tokens ?? exchanged.tokens),
      clearCookie(CHALLENGE_COOKIE),
    ]);
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

  // The control centre is for Staff and Admin. Signed-out visitors go to the website (which
  // owns sign-in); Press are sent to the media room, their own workspace.
  if (wantsHtml(req) && !isAssetRequest(path)) {
    const session = await resolveSession(req, env, res);
    if (!session) {
      redirect(res, websiteDestination(req, env));
      return;
    }
    if (session.user.role === "Press") {
      redirect(res, workspaceDestination(session.user.role, req, env));
      return;
    }
  }

  next();
}

export function controlServerPlugin(env: ServerEnv): Plugin {
  return {
    name: "control-centre-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(env, req, res, next).catch(() => {
          if (!res.headersSent) sendJson(res, 500, { message: "Unexpected server error." });
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(env, req, res, next).catch(() => {
          if (!res.headersSent) sendJson(res, 500, { message: "Unexpected server error." });
        });
      });
    },
  };
}
