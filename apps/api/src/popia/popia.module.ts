import { Module } from "@nestjs/common";
import { PopiaController } from "./popia.controller.ts";
import { PopiaRepository } from "./popia.repository.ts";
import { PopiaService } from "./popia.service.ts";

@Module({
  controllers: [PopiaController],
  providers: [PopiaRepository, PopiaService],
})
export class PopiaModule {}
