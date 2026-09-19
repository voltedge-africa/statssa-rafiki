import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import { gapCategoryListQuerySchema } from "@voltedge/gaps-contract";
import { safeParse, type BaseIssue } from "valibot";
import { Roles } from "../auth/roles.decorator.ts";
import { DEFAULT_DAYS, MAX_DAYS, MIN_DAYS } from "./config.ts";
import { GapsService } from "./gaps.service.ts";

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

function boundedDays(value: string | undefined): number {
  return boundedInteger(value, DEFAULT_DAYS, MIN_DAYS, MAX_DAYS);
}

/**
 * The knowledge-gap read surface for the control centre: the categorised log of
 * queries the approved sources could not answer. Staff and Admin only; recording
 * itself is internal (no public write endpoint).
 */
@Controller("gaps")
@Roles("Staff", "Admin")
export class GapsController {
  constructor(private readonly gaps: GapsService) {}

  @Get("summary")
  summary(@Query("days") days: string | undefined) {
    return this.gaps.summary(boundedDays(days));
  }

  @Get("categories")
  categories(
    @Query("q") q: string | undefined,
    @Query("limit") limit: string | undefined,
    @Query("offset") offset: string | undefined,
  ) {
    const parsed = safeParse(gapCategoryListQuerySchema, { q });
    if (!parsed.success) throw validationError(parsed.issues);
    return this.gaps.listCategories({
      q: parsed.output.q,
      limit: boundedInteger(limit, 25, 1, 100),
      offset: boundedInteger(offset, 0, 0, 10_000),
    });
  }

  @Get("categories/:id/queries")
  queries(
    @Param("id") id: string,
    @Query("limit") limit: string | undefined,
    @Query("offset") offset: string | undefined,
  ) {
    return this.gaps.listQueries(
      id,
      boundedInteger(limit, 25, 1, 100),
      boundedInteger(offset, 0, 0, 10_000),
    );
  }
}
