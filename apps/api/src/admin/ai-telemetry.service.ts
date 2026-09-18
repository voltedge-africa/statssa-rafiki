import { Injectable } from "@nestjs/common";
import type { AiSessionSpan, AiUsageFilters, AiUsageSummary } from "@voltedge/agent-contract";
import { TelemetryRepository } from "../agent/telemetry.repository.ts";

@Injectable()
export class AiTelemetryService {
  constructor(private readonly repo: TelemetryRepository) {}

  usage(filters: AiUsageFilters): Promise<AiUsageSummary> {
    return this.repo.summary(filters);
  }

  modelCalls(filters: AiUsageFilters, limit: number, offset: number) {
    return this.repo.listModelCalls(filters, limit, offset);
  }

  toolCalls(filters: AiUsageFilters, limit: number, offset: number) {
    return this.repo.listToolCalls(filters, limit, offset);
  }

  session(sessionId: string): Promise<AiSessionSpan[]> {
    return this.repo.sessionSpans(sessionId);
  }
}
