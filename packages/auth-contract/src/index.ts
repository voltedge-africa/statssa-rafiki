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
