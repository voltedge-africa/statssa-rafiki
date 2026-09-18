import { appUrlFromOrigin, workspaceForRole, type Role } from "@voltedge/auth-contract";

import { env } from "./env.ts";

/** The media room (Press workspace) runs alongside this site on port 3004 in development. */
export function mediaPortalUrl(): string {
  return env.mediaPortalUrl ?? appUrlFromOrigin(window.location.origin, "mediaPortal");
}

/** The control centre (Staff/Admin workspace) runs alongside this site on port 3006. */
export function controlCentreUrl(): string {
  return env.controlCentreUrl ?? appUrlFromOrigin(window.location.origin, "controlCentre");
}

/**
 * Where a signed-in user's workspace lives: Press read the media room, Staff and Admin run the
 * control centre.
 */
export function workspaceHome(role: Role): string {
  return workspaceForRole(role) === "mediaPortal" ? mediaPortalUrl() : controlCentreUrl();
}
