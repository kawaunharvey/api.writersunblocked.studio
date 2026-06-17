import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common'
import { CreateStoryboardNoteDto, UpdateStoryboardNoteDto } from './storyboard-notes.dto'
import { StoryboardNotesService } from './storyboard-notes.service'

@Controller()
export class StoryboardNotesController {
  constructor(private readonly storyboardNotesService: StoryboardNotesService) {}

  @Post('stories/:storyId/notes')
  create(
    @Param('storyId') storyId: string,
    @Req() req: any,
    @Body() dto: CreateStoryboardNoteDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storyboardNotesService.create(storyId, userId, dto);
  }

  @Patch('stories/:storyId/notes/:noteId')
  update(
    @Param('storyId') storyId: string,
    @Param('noteId') noteId: string,
    @Req() req: any,
    @Body() dto: UpdateStoryboardNoteDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storyboardNotesService.update(storyId, noteId, userId, dto);
  }

  @Get('stories/:storyId/notes')
  list(@Param('storyId') storyId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.storyboardNotesService.list(storyId, userId);
  }
}
