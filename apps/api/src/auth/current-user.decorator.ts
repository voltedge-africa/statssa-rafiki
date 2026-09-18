import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import type { AuthenticatedRequest } from "./auth.types.ts";

/** The verified token subject for the current request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
