import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/public.decorator.ts";

@Controller()
export class AppController {
  @Get("health")
  @Public()
  health() {
    return { status: "ok", uptime: process.uptime() };
  }
}
