import { Controller, Get } from "@nestjs/common";
import { Roles } from "../auth/roles.decorator.ts";

@Controller("admin")
export class AdminController {
  @Get("ping")
  @Roles("Admin")
  ping() {
    return { message: "Admin access confirmed" };
  }
}
