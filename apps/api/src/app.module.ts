import { Module } from "@nestjs/common";
import { AdminController } from "./admin/admin.controller.ts";
import { AppController } from "./app.controller.ts";
import { AuthModule } from "./auth/auth.module.ts";

@Module({
  imports: [AuthModule],
  controllers: [AppController, AdminController],
})
export class AppModule {}
