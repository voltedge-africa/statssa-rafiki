import { env } from "./env.ts";

/**
 * The control centre (admin workspace) runs alongside this site (port 3006 in development), so
 * derive its URL from the hostname the browser used. Set VITE_CONTROL_CENTRE_URL to override in
 * production or behind a proxy.
 */
export function controlCentreUrl(): string {
  if (env.controlCentreUrl) return env.controlCentreUrl;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3006`;
}

/** Where a signed-in user's workspace lives: Press stay here, Staff and Admin go to the control centre. */
export function workspaceHome(role: "Press" | "Staff" | "Admin"): string {
  return role === "Press" ? "/press" : controlCentreUrl();
}
