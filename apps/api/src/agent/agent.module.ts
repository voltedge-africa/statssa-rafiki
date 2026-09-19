import { Module } from "@nestjs/common";
import { GovernanceModule } from "../admin/governance.module.ts";
import { GapsLabellingService } from "../gaps/gaps.labelling.service.ts";
import { GapsModule } from "../gaps/gaps.module.ts";
import { AgentController } from "./agent.controller.ts";
import { AgentService } from "./agent.service.ts";
import { RagController } from "./rag.controller.ts";
import { TelemetryController } from "./telemetry.controller.ts";
import { TelemetryPersistenceService } from "./telemetry.persistence.ts";
import { TelemetryRepository } from "./telemetry.repository.ts";
import { TelemetryService } from "./telemetry.service.ts";

@Module({
  imports: [GovernanceModule, GapsModule],
  controllers: [AgentController, RagController, TelemetryController],
  providers: [
    AgentService,
    TelemetryService,
    TelemetryRepository,
    TelemetryPersistenceService,
    GapsLabellingService,
  ],
  exports: [AgentService, TelemetryService, TelemetryRepository, GapsLabellingService],
})
export class AgentModule {}
