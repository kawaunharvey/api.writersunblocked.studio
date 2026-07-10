import { DatabaseModule } from "@/database/database.module";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ProviderService } from "../ai/provider.service";
import { ScenesModule } from "../scenes/scenes.module";
import { StoryIntelligenceModule } from "../story-intelligence/story-intelligence.module";
import { CommentsService } from "./modules/comments/comments.service";
import { MentionsModule } from "./modules/mentions/mentions.module";
import { NotesService } from "./modules/notes/notes.service";
import { PlatformApplyService } from "./platform/platform-apply.service";
import { PlatformPersistenceController } from "./platform/platform-persistence.controller";
import { PlatformPersistenceService } from "./platform/platform-persistence.service";
import { StoryboardController } from "./storyboard.controller";
import { StoryboardGateway } from "./storyboard.gateway";
import { StoryboardService } from "./storyboard.service";
import { STORYBOARD_INTERROGATE_QUEUE } from "./worker/interrogate/interrogate.constants";
import { StoryboardInterrogateWorker } from "./worker/interrogate/interrogate.worker";
import { STORYBOARD_ONBOARD_QUEUE } from "./worker/onboard/onboard.constants";
import { StoryboardOnboardingWorker } from "./worker/onboard/onboard.worker";
import { STORYBOARD_PLATFORM_QUEUE } from "./worker/platform/platform.constants";
import { StoryboardPlatformWorker } from "./worker/platform/platform.worker";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: STORYBOARD_PLATFORM_QUEUE },
      { name: STORYBOARD_ONBOARD_QUEUE },
      { name: STORYBOARD_INTERROGATE_QUEUE },
    ),
    DatabaseModule,
    MentionsModule,
    ScenesModule,
    StoryIntelligenceModule,
  ],
  controllers: [StoryboardController, PlatformPersistenceController],
  providers: [
    ProviderService,
    CommentsService,
    NotesService,
    StoryboardService,
    StoryboardGateway,
    PlatformPersistenceService,
    PlatformApplyService,
    StoryboardOnboardingWorker,
    StoryboardPlatformWorker,
    StoryboardInterrogateWorker,
  ],
})
export class StoryboardModule {}
