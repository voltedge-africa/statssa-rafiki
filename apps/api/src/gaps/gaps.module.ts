import { Module } from "@nestjs/common";
import { GapsController } from "./gaps.controller.ts";
import { GapsRepository } from "./gaps.repository.ts";
import { GapsService } from "./gaps.service.ts";

/**
 * The knowledge-gap log. Deliberately free of agent dependencies so the chat
 * and media modules can record into it without a module cycle; the optional
 * model labelling lives in `GapsLabellingService` (provided by AgentModule).
 */
@Module({
  controllers: [GapsController],
  providers: [GapsRepository, GapsService],
  exports: [GapsService],
})
export class GapsModule {}
