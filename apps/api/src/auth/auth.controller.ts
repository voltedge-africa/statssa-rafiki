import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import { CurrentUser } from "./current-user.decorator.ts";

@Controller()
export class AuthController {
  @Get("me")
  me(@CurrentUser() user?: AuthUser) {
    return user;
  }
}
