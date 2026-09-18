import { createSubjects } from "@openauthjs/openauth/subject";
import { object, picklist, string, type InferOutput } from "valibot";

/** The set of roles a user can register with. */
export const ROLES = ["Press", "Staff", "Admin"] as const;

export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "Press";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

const user = object({
  id: string(),
  role: picklist(ROLES),
});

/** The verified contents of an access token issued by the Rafiki auth server. */
export type AuthUser = InferOutput<typeof user>;

/**
 * Access-token subject schema. The auth server issues tokens against this schema and every
 * consumer (website, API) verifies against it, so all sides agree on the payload shape.
 */
export const subjects = createSubjects({ user });

/**
 * Session cookie names shared by every Rafiki app. Cookies ignore the port, so on one host
 * (eg. localhost, or a single proxied origin) one sign-in establishes a session that the
 * website, media room and control centre all read. Keeping the names here stops the apps
 * drifting apart the way `website_access`/`media_access`/`control_access` once did.
 */
export const SESSION_ACCESS_COOKIE = "rafiki_access";
export const SESSION_REFRESH_COOKIE = "rafiki_refresh";

/** Default ports each app runs on in development; overridden per app through VITE_*_URL. */
export const APP_PORTS = {
  auth: 3000,
  api: 3001,
  website: 3002,
  publicPortal: 3003,
  mediaPortal: 3004,
  controlCentre: 3006,
} as const;

export type AppName = keyof typeof APP_PORTS;

/** The app a role belongs in: Press read the media room, Staff and Admin run the control centre. */
export type Workspace = "mediaPortal" | "controlCentre";

export function workspaceForRole(role: Role): Workspace {
  return role === "Press" ? "mediaPortal" : "controlCentre";
}

/**
 * Resolve a sibling app's URL from the browser's origin. Used when no explicit VITE_*_URL is
 * configured, so localhost/tailnet development lands on the right port without hardcoding.
 */
export function appUrlFromOrigin(origin: string, app: AppName): string {
  const url = new URL(origin);
  url.port = String(APP_PORTS[app]);
  return url.origin;
}
