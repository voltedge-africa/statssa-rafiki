import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import type { AiUsageFilters } from "@voltedge/agent-contract";
import { Roles } from "../auth/roles.decorator.ts";
import { AiTelemetryService } from "./ai-telemetry.service.ts";

type QueryValues = Record<string, string | undefined>;

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

function optionalDate(value: string | undefined, field: string): string | undefined {
  const result = trimmed(value);
  if (result === undefined) return undefined;
  if (Number.isNaN(Date.parse(result))) {
    throw new BadRequestException(`"${field}" must be an ISO date-time.`);
  }
  return result;
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

function filters(query: QueryValues): AiUsageFilters {
  return {
    from: optionalDate(query.from, "from"),
    to: optionalDate(query.to, "to"),
    model: trimmed(query.model),
    feature: trimmed(query.feature),
    role: trimmed(query.role),
    tool: trimmed(query.tool),
    sessionId: trimmed(query.session),
  };
}

/**
 * Model-governance read surface. Admin-only; returns what the model did, which
 * tools it used and how each call performed, never prompt or response content.
 */
@Controller("admin/ai")
@Roles("Admin")
export class AiTelemetryController {
  constructor(private readonly telemetry: AiTelemetryService) {}

  @Get("usage")
  usage(@Query() query: QueryValues) {
    return this.telemetry.usage(filters(query));
  }

  @Get("model-calls")
  modelCalls(@Query() query: QueryValues) {
    return this.telemetry.modelCalls(
      filters(query),
      boundedInteger(query.limit, 25, 1, 100),
      boundedInteger(query.offset, 0, 0, 1_000_000),
    );
  }

  @Get("tool-calls")
  toolCalls(@Query() query: QueryValues) {
    return this.telemetry.toolCalls(
      filters(query),
      boundedInteger(query.limit, 25, 1, 100),
      boundedInteger(query.offset, 0, 0, 1_000_000),
    );
  }

  @Get("sessions/:sessionId")
  async session(@Param("sessionId") sessionId: string) {
    return { spans: await this.telemetry.session(sessionId) };
  }
}
