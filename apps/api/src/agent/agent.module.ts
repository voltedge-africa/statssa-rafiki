import { Module } from "@nestjs/common";
import { GovernanceModule } from "../admin/governance.module.ts";
import { AgentController } from "./agent.controller.ts";
import { AgentService } from "./agent.service.ts";
import { RagController } from "./rag.controller.ts";
import { TelemetryController } from "./telemetry.controller.ts";
import { TelemetryPersistenceService } from "./telemetry.persistence.ts";
import { TelemetryRepository } from "./telemetry.repository.ts";
import { TelemetryService } from "./telemetry.service.ts";

@Module({
  imports: [GovernanceModule],
  controllers: [AgentController, RagController, TelemetryController],
  providers: [AgentService, TelemetryService, TelemetryRepository, TelemetryPersistenceService],
  exports: [AgentService, TelemetryService, TelemetryRepository],
})
export class AgentModule {}
