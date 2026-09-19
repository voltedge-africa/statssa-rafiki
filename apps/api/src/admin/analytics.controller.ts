import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import { Roles } from "../auth/roles.decorator.ts";
import { AnalyticsService, DEFAULT_DAYS, MAX_DAYS, MIN_DAYS } from "./analytics.service.ts";

function boundedDays(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_DAYS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new BadRequestException(`Expected an integer, got "${value}".`);
  }
  return Math.min(Math.max(parsed, MIN_DAYS), MAX_DAYS);
}

/**
 * The control-centre analytics read surface. Staff and Admin see the desk
 * rollups; the AI section is attached only for Admin callers.
 */
@Controller("analytics")
@Roles("Staff", "Admin")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  snapshot(@Query("days") days: string | undefined, @CurrentUser() user: AuthUser) {
    return this.analytics.snapshot(boundedDays(days), user.role === "Admin");
  }
}
