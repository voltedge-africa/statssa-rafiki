import { Module } from "@nestjs/common";
import { GovernanceController } from "./governance.controller.ts";
import { GovernanceRepository } from "./governance.repository.ts";
import { GovernanceService } from "./governance.service.ts";

@Module({
  controllers: [GovernanceController],
  providers: [GovernanceRepository, GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
