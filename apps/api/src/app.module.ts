import { Module } from "@nestjs/common";
import { AdminController } from "./admin/admin.controller.ts";
import { AiTelemetryController } from "./admin/ai-telemetry.controller.ts";
import { AiTelemetryService } from "./admin/ai-telemetry.service.ts";
import { GovernanceModule } from "./admin/governance.module.ts";
import { AgentModule } from "./agent/agent.module.ts";
import { AppController } from "./app.controller.ts";
import { AuthModule } from "./auth/auth.module.ts";
import { MediaModule } from "./media/media.module.ts";
import { PopiaModule } from "./popia/popia.module.ts";

@Module({
  imports: [AuthModule, AgentModule, PopiaModule, MediaModule, GovernanceModule],
  controllers: [AppController, AdminController, AiTelemetryController],
  providers: [AiTelemetryService],
})
export class AppModule {}
