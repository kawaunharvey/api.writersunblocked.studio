import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { PassagesService } from './passages.service';
import {
  CreatePassageDto,
  CreatePassageNoteDto,
  UpdatePassageDto,
  UpdatePassageNoteDto,
} from './passages.dto';

@Controller()
export class PassagesController {
  constructor(private readonly passagesService: PassagesService) {}

  @Get('stories/:storyId/passages')
  listForStory(@Param('storyId') storyId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.passagesService.listForStory(storyId, userId);
  }

  @Post('stories/:storyId/passages')
  create(@Param('storyId') storyId: string, @Req() req: any, @Body() dto: CreatePassageDto) {
    const { userId } = req.user as { userId: string };
    return this.passagesService.create(storyId, userId, dto);
  }

  @Patch('stories/:storyId/passages/:passageId')
  update(
    @Param('storyId') storyId: string,
    @Param('passageId') passageId: string,
    @Req() req: any,
    @Body() dto: UpdatePassageDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.passagesService.update(passageId, userId, dto);
  }

  @Delete('stories/:storyId/passages/:passageId')
  @HttpCode(204)
  async remove(
    @Param('storyId') storyId: string,
    @Param('passageId') passageId: string,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    await this.passagesService.delete(passageId, userId);
  }

  @Get('passages/:passageId/notes')
  listNotes(@Param('passageId') passageId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.passagesService.listNotes(passageId, userId);
  }

  @Post('passages/:passageId/notes')
  createNote(
    @Param('passageId') passageId: string,
    @Req() req: any,
    @Body() dto: CreatePassageNoteDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.passagesService.createNote(passageId, userId, dto);
  }

  @Patch('passages/:passageId/notes/:noteId')
  updateNote(
    @Param('passageId') passageId: string,
    @Param('noteId') noteId: string,
    @Req() req: any,
    @Body() dto: UpdatePassageNoteDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.passagesService.updateNote(noteId, userId, dto);
  }

  @Delete('passages/:passageId/notes/:noteId')
  @HttpCode(204)
  async removeNote(
    @Param('passageId') passageId: string,
    @Param('noteId') noteId: string,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    await this.passagesService.deleteNote(noteId, userId);
  }
}
