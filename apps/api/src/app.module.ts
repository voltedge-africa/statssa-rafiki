import { Module } from "@nestjs/common";
import { AdminController } from "./admin/admin.controller.ts";
import { AgentModule } from "./agent/agent.module.ts";
import { AppController } from "./app.controller.ts";
import { AuthModule } from "./auth/auth.module.ts";
import { PopiaModule } from "./popia/popia.module.ts";

@Module({
  imports: [AuthModule, AgentModule, PopiaModule],
  controllers: [AppController, AdminController],
})
export class AppModule {}
