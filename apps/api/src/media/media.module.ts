import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.ts";
import { MediaDraftService } from "./media-draft.service.ts";
import { MediaController } from "./media.controller.ts";
import { MediaRepository } from "./media.repository.ts";
import { MediaService } from "./media.service.ts";

@Module({
  imports: [AgentModule],
  controllers: [MediaController],
  providers: [MediaRepository, MediaDraftService, MediaService],
})
export class MediaModule {}
