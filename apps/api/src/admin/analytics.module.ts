import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.ts";
import { AnalyticsController } from "./analytics.controller.ts";
import { AnalyticsRepository } from "./analytics.repository.ts";
import { AnalyticsService } from "./analytics.service.ts";

@Module({
  imports: [AgentModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsRepository, AnalyticsService],
})
export class AnalyticsModule {}
