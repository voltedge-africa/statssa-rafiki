import { BadRequestException, Body, Controller, Get, Patch } from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import { governanceSettingsUpdateSchema } from "@voltedge/agent-contract";
import { safeParse, type BaseIssue } from "valibot";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import { Roles } from "../auth/roles.decorator.ts";
import { GovernanceService } from "./governance.service.ts";

function validationError(issues: BaseIssue<unknown>[]): BadRequestException {
  return new BadRequestException({
    message: "Validation failed",
    issues: issues.map((issue) => ({
      path: issue.path?.map((item) => item.key).join(".") ?? "",
      message: issue.message,
    })),
  });
}

/**
 * The AI governance settings surface. Admin-only; the only place the confidence
 * floor, tool allowlist, kill switch and maintained copy can be changed.
 */
@Controller("admin/governance")
@Roles("Admin")
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get()
  get() {
    return this.governance.get();
  }

  @Patch()
  async update(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = safeParse(governanceSettingsUpdateSchema, body ?? {});
    if (!parsed.success) throw validationError(parsed.issues);
    return this.governance.update(parsed.output, user);
  }
}
