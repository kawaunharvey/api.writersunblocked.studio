import { DatabaseModule } from '@/database/database.module';
import { GatewayModule } from '@/modules/gateway/gateway.module';
import { StoryIntelligenceModule } from '@/modules/story-intelligence/story-intelligence.module';
import { Module } from '@nestjs/common';
import { ScenesModule } from '../scenes/scenes.module';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

@Module({
  imports: [DatabaseModule, ScenesModule, GatewayModule, StoryIntelligenceModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}
