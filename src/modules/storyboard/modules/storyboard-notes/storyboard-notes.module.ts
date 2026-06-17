import { DatabaseModule } from "@/database/database.module";
import { EventsModule } from "@/events/events.module";
import { GatewayModule } from "@/modules/gateway/gateway.module";
import { Module } from "@nestjs/common";
import { StoryboardCommentsController } from "./storyboard-comments.controller";
import { StoryboardCommentsService } from "./storyboard-comments.service";
import { StoryboardNotesController } from "./storyboard-notes.controller";
import { StoryboardNotesService } from "./storyboard-notes.service";

@Module({
  imports: [DatabaseModule, EventsModule, GatewayModule],
  controllers: [StoryboardNotesController, StoryboardCommentsController],
  providers: [StoryboardNotesService, StoryboardCommentsService],
  exports: [StoryboardNotesService, StoryboardCommentsService],
})
export class StoryboardNotesModule {}
