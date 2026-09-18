import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service.ts";
import type { AuthenticatedRequest } from "./auth.types.ts";
import { IS_OPTIONAL_AUTH_KEY } from "./optional-auth.decorator.ts";
import { IS_PUBLIC_KEY } from "./public.decorator.ts";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const optional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header) {
      if (optional) return true;
      throw new UnauthorizedException("Missing access token");
    }

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Invalid authorization header");
    }

    const user = await this.auth.verify(request, token);
    if (!user) throw new UnauthorizedException("Invalid access token");

    request.user = user;
    return true;
  }
}
