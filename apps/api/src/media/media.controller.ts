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
  approveMediaRequestSchema,
  createMediaNoteSchema,
  isMediaRequestStatus,
  mediaRequestListQuerySchema,
  rejectMediaRequestSchema,
  submitMediaRequestSchema,
  updateMediaRequestSchema,
  type MediaRequestStatus,
} from "@voltedge/media-contract";
import { safeParse, type BaseIssue } from "valibot";
import { CurrentUser } from "../auth/current-user.decorator.ts";
import { Roles } from "../auth/roles.decorator.ts";
import { MediaService, type MediaQueueQuery } from "./media.service.ts";

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

function optionalStatus(value: string | undefined): MediaRequestStatus | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!isMediaRequestStatus(trimmed)) {
    throw new BadRequestException(`Unknown status "${trimmed}".`);
  }
  return trimmed;
}

@Controller("media/requests")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Any signed-in account can file a fact-check request. */
  @Post()
  async submit(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = safeParse(submitMediaRequestSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { request: await this.media.submit(parsed.output, user) };
  }

  @Get("mine")
  async mine(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    const parsed = safeParse(mediaRequestListQuerySchema, {
      q: query.q,
      status: query.status,
    });
    if (!parsed.success) throw validationError(parsed.issues);
    return this.media.listMine(user, {
      status: parsed.output.status,
      search: parsed.output.q?.trim() || undefined,
      limit: boundedInteger(query.limit, 50, 1, 100),
      offset: boundedInteger(query.offset, 0, 0, 10_000),
    });
  }

  @Get("mine/:reference")
  async trackMine(@Param("reference") reference: string, @CurrentUser() user: AuthUser) {
    return { request: await this.media.trackForOwner(reference.toUpperCase(), user) };
  }

  @Post(":reference/withdraw")
  @HttpCode(200)
  async withdraw(@Param("reference") reference: string, @CurrentUser() user: AuthUser) {
    return { request: await this.media.withdraw(reference.toUpperCase(), user) };
  }

  /** Any signed-in account can browse the approved official responses. */
  @Get("feed")
  feed(@Query() query: Record<string, string | undefined>) {
    return this.media.listOfficialResponses({
      limit: boundedInteger(query.limit, 25, 1, 100),
      offset: boundedInteger(query.offset, 0, 0, 10_000),
    });
  }

  @Get()
  @Roles("Staff", "Admin")
  list(@Query() query: Record<string, string | undefined>, @CurrentUser() user: AuthUser) {
    const filters: MediaQueueQuery = {
      status: optionalStatus(query.status),
      assigned: query.assigned?.trim() || undefined,
      search: query.q?.trim() || undefined,
      limit: boundedInteger(query.limit, 25, 1, 100),
      offset: boundedInteger(query.offset, 0, 0, 10_000),
    };
    return this.media.listForStaff(filters, user);
  }

  @Get(":reference")
  @Roles("Staff", "Admin")
  async detail(@Param("reference") reference: string) {
    return { request: await this.media.detail(reference.toUpperCase()) };
  }

  @Patch(":reference")
  @Roles("Staff", "Admin")
  async update(
    @Param("reference") reference: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = safeParse(updateMediaRequestSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { request: await this.media.update(reference.toUpperCase(), parsed.output, user) };
  }

  @Post(":reference/approve")
  @Roles("Staff", "Admin")
  async approve(
    @Param("reference") reference: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = safeParse(approveMediaRequestSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { request: await this.media.approve(reference.toUpperCase(), parsed.output, user) };
  }

  @Post(":reference/reject")
  @Roles("Staff", "Admin")
  async reject(
    @Param("reference") reference: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = safeParse(rejectMediaRequestSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { request: await this.media.reject(reference.toUpperCase(), parsed.output, user) };
  }

  /** Ask for a fresh grounded draft (for example after the retrieval index changes). */
  @Post(":reference/regenerate")
  @Roles("Staff", "Admin")
  async regenerate(@Param("reference") reference: string, @CurrentUser() user: AuthUser) {
    return { request: await this.media.regenerate(reference.toUpperCase(), user) };
  }

  @Post(":reference/notes")
  @Roles("Staff", "Admin")
  async note(
    @Param("reference") reference: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = safeParse(createMediaNoteSchema, body);
    if (!parsed.success) throw validationError(parsed.issues);
    return { request: await this.media.addNote(reference.toUpperCase(), parsed.output, user) };
  }
}
