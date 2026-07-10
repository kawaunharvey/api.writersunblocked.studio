import { DatabaseModule } from '@/database/database.module';
import { EventsModule } from '@/events/events.module';
import { AiModule } from '@/modules/ai/ai.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CharacterObservationHandler } from './jobs/handlers/character-observation.handler';
import { INTELLIGENCE_QUEUE } from './jobs/intelligence.constants';
import { IntelligenceOrchestratorWorker } from './jobs/intelligence-orchestrator.worker';
import { IntelligenceContextService } from './services/intelligence-context.service';
import { IntelligenceOrchestratorService } from './services/intelligence-orchestrator.service';
import { StoryInputService } from './services/story-input.service';
import { ThreadService } from './services/thread.service';
import {
  SceneIntelligenceController,
  StoryIntelligenceController,
} from './story-intelligence.controller';
import { StoryIntelligenceGateway } from './story-intelligence.gateway';

@Module({
  imports: [
    BullModule.registerQueue({ name: INTELLIGENCE_QUEUE }),
    DatabaseModule,
    AiModule,
    EventsModule,
  ],
  controllers: [StoryIntelligenceController, SceneIntelligenceController],
  providers: [
    StoryInputService,
    ThreadService,
    IntelligenceContextService,
    IntelligenceOrchestratorService,
    CharacterObservationHandler,
    IntelligenceOrchestratorWorker,
    StoryIntelligenceGateway,
  ],
  exports: [
    StoryInputService,
    ThreadService,
    IntelligenceContextService,
    IntelligenceOrchestratorService,
  ],
})
export class StoryIntelligenceModule {}
