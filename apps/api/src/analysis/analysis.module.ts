import { Module } from "@nestjs/common";
import { GovernanceModule } from "../admin/governance.module.ts";
import { AgentModule } from "../agent/agent.module.ts";
import { AnalysisController } from "./analysis.controller.ts";
import { AnalysisDraftService } from "./analysis-draft.service.ts";
import { AnalysisRepository } from "./analysis.repository.ts";
import { AnalysisService } from "./analysis.service.ts";

@Module({
  imports: [AgentModule, GovernanceModule],
  controllers: [AnalysisController],
  providers: [AnalysisRepository, AnalysisDraftService, AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
