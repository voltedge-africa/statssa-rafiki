import { Module } from "@nestjs/common";
import { AgentController } from "./agent.controller.ts";
import { AgentService } from "./agent.service.ts";
import { RagController } from "./rag.controller.ts";
import { TelemetryController } from "./telemetry.controller.ts";
import { TelemetryService } from "./telemetry.service.ts";

@Module({
  controllers: [AgentController, RagController, TelemetryController],
  providers: [AgentService, TelemetryService],
  exports: [AgentService, TelemetryService],
})
export class AgentModule {}
