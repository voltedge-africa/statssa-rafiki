import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { AuthUser } from "@voltedge/auth-contract";
import {
  createPopiaNoteSchema,
  isPopiaRequestStatus,
  isPopiaRequestType,
  submitPopiaRequestSchema,
  trackPopiaRequestSchema,
  updatePopiaRequestSchema,
  type PopiaRequestStatus,
  type PopiaRequestType,
} from "@voltedge/popia-contract";
import { safeParse, type BaseIssue } from "valibot";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import { OptionalAuth } from "../auth/optional-auth.decorator.ts";
import { Public } from "../auth/public.decorator.ts";
import { Roles } from "../auth/roles.decorator.ts";
import { PopiaService, type QueueQuery } from "./popia.service.ts";

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

function optionalStatus(value: string | undefined): PopiaRequestStatus | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!isPopiaRequestStatus(trimmed)) {
    throw new BadRequestException(`Unknown status "${trimmed}".`);
  }
  return trimmed;
}

function optionalType(value: string | undefined): PopiaRequestType | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!isPopiaRequestType(trimmed)) {
    throw new BadRequestException(`Unknown request type "${trimmed}".`);
  }
  return trimmed;
}

@Controller("popia/requests")
export class PopiaController {
  constructor(private readonly popia: PopiaService) {}

  /** Public submission. A valid bearer token links the request to the signed-in account. */
  @Post()
  @OptionalAuth()
  async submit(@Body() body: unknown, @CurrentUser() user?: AuthUser) {
    const parsed = safeParse(submitPopiaRequestSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { request: await this.popia.submit(parsed.output, user) };
  }

  /** Public status tracking: reference plus the email the request was submitted with. */
  @Post("track")
  @Public()
  @HttpCode(200)
  async track(@Body() body: unknown) {
    const parsed = safeParse(trackPopiaRequestSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { request: await this.popia.track(parsed.output) };
  }

  @Get("mine")
  async mine(@CurrentUser() user: AuthUser) {
    return { requests: await this.popia.listMine(user) };
  }

  @Get()
  @Roles("Staff", "Admin")
  list(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    const filters: QueueQuery = {
      status: optionalStatus(query.status),
      type: optionalType(query.type),
      assigned: query.assigned?.trim() || undefined,
      search: query.q?.trim() || undefined,
      limit: boundedInteger(query.limit, 25, 1, 100),
      offset: boundedInteger(query.offset, 0, 0, 10_000),
    };
    return this.popia.listForStaff(filters, user);
  }

  @Get(":reference")
  @Roles("Staff", "Admin")
  async detail(@Param("reference") reference: string) {
    return { request: await this.popia.detail(reference.toUpperCase()) };
  }

  @Patch(":reference")
  @Roles("Staff", "Admin")
  async update(
    @Param("reference") reference: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = safeParse(updatePopiaRequestSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { request: await this.popia.update(reference.toUpperCase(), parsed.output, user) };
  }

  @Post(":reference/notes")
  @Roles("Staff", "Admin")
  async note(
    @Param("reference") reference: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = safeParse(createPopiaNoteSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { request: await this.popia.addNote(reference.toUpperCase(), parsed.output, user) };
  }
}
