import { SetMetadata } from "@nestjs/common";
import type { Role } from "@voltedge/auth-contract";

export const ROLES_KEY = "roles";

/** Restricts a route to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
