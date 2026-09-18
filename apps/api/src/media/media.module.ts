import { Module, forwardRef } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.ts";
import { MediaDraftService } from "./media-draft.service.ts";
import { MediaController } from "./media.controller.ts";
import { MediaRepository } from "./media.repository.ts";
import { MediaService } from "./media.service.ts";

@Module({
  imports: [forwardRef(() => AgentModule)],
  controllers: [MediaController],
  providers: [MediaRepository, MediaDraftService, MediaService],
  exports: [MediaDraftService],
})
export class MediaModule {}
