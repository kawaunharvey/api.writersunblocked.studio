import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { DreamThreadsModule } from '../dream-threads/dream-threads.module'
import { EventsModule } from '../events/events.module'
import { GatewayModule } from '../gateway/gateway.module'
import { StoryboardCommentsController } from './storyboard-comments.controller'
import { StoryboardCommentsService } from './storyboard-comments.service'
import { StoryboardNotesController } from './storyboard-notes.controller'
import { StoryboardNotesService } from './storyboard-notes.service'

@Module({
  imports: [DatabaseModule, DreamThreadsModule, EventsModule, GatewayModule],
  controllers: [StoryboardNotesController, StoryboardCommentsController],
  providers: [StoryboardNotesService, StoryboardCommentsService],
  exports: [StoryboardNotesService, StoryboardCommentsService],
})
export class StoryboardNotesModule {}
