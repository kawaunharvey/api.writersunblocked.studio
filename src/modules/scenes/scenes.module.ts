import { DatabaseModule } from '@/database/database.module'
import { StoryIntelligenceModule } from '@/modules/story-intelligence/story-intelligence.module'
import { Module } from '@nestjs/common'
import { ScenesController } from './scenes.controller'
import { ScenesService } from './scenes.service'

@Module({
  imports: [
    DatabaseModule,
    StoryIntelligenceModule,
  ],
  controllers: [ScenesController],
  providers: [ScenesService],
  exports: [ScenesService],
})
export class ScenesModule {}
