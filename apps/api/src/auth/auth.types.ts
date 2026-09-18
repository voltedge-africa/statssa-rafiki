import type { AuthUser } from "@voltedge/auth-contract";
import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
