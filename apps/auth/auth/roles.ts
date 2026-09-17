// The set of roles a user can register with. Keep these values in sync with the
// subject schema (see ./subjects.ts) and the client apps that verify tokens.
export const ROLES = ["Press", "Staff", "Admin"] as const;

export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "Press";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
