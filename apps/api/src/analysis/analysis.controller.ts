import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import { analysisBriefListQuerySchema, createAnalysisBriefSchema } from "@voltedge/brief-contract";
import { safeParse, type BaseIssue } from "valibot";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import { Roles } from "../auth/roles.decorator.ts";
import { AnalysisService } from "./analysis.service.ts";

function validationError(issues: BaseIssue<unknown>[]): BadRequestException {
  return new BadRequestException({
    message: "Validation failed",
    issues: issues.map((issue) => ({
      path: issue.path?.map((item) => item.key).join(".") ?? "",
      message: issue.message,
    })),
  });
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new BadRequestException(`Expected an integer, got "${value}".`);
  }
  return Math.min(Math.max(parsed, min), max);
}

/**
 * The content-analysis surface for the control centre: the indexed-document
 * picker, brief generation from selected official content, and the saved-brief
 * history. Staff and Admin only.
 */
@Controller("analysis")
@Roles("Staff", "Admin")
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get("documents")
  documents() {
    return this.analysis.documents();
  }

  @Post("briefs")
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = safeParse(createAnalysisBriefSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { brief: await this.analysis.create(parsed.output, user) };
  }

  @Get("briefs")
  list(
    @Query("q") q: string | undefined,
    @Query("limit") limit: string | undefined,
    @Query("offset") offset: string | undefined,
  ) {
    const parsed = safeParse(analysisBriefListQuerySchema, { q });
    if (!parsed.success) throw validationError(parsed.issues);
    return this.analysis.list({
      q: parsed.output.q,
      limit: boundedInteger(limit, 25, 1, 100),
      offset: boundedInteger(offset, 0, 0, 10_000),
    });
  }

  @Get("briefs/:id")
  async get(@Param("id") id: string) {
    return { brief: await this.analysis.get(id) };
  }
}
