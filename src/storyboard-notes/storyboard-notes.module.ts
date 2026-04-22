import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { DreamThreadsModule } from '../dream-threads/dream-threads.module'
import { StoryboardNotesController } from './storyboard-notes.controller'
import { StoryboardNotesService } from './storyboard-notes.service'

@Module({
  imports: [DatabaseModule, DreamThreadsModule],
  controllers: [StoryboardNotesController],
  providers: [StoryboardNotesService],
  exports: [StoryboardNotesService],
})
export class StoryboardNotesModule {}
