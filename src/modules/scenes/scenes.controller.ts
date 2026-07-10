
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common'
import { IntelligenceOrchestratorService } from '@/modules/story-intelligence/services/intelligence-orchestrator.service'
import {
  CreateSceneDto,
  CreateSceneNoteDto,
  SetSceneActiveVersionDto,
  UpdateSceneDto,
  UpdateSceneNoteDto,
} from './scenes.dto'
import { ScenesService } from './scenes.service'

@Controller()
export class ScenesController {
  constructor(
    private readonly scenesService: ScenesService,
    private readonly intelligenceOrchestrator: IntelligenceOrchestratorService,
  ) {}

  @Get('stories/:storyId/scenes')
  listForStory(@Param('storyId') storyId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.scenesService.listForStory(storyId, userId);
  }

  @Post('stories/:storyId/scenes')
  create(@Param('storyId') storyId: string, @Req() req: any, @Body() dto: CreateSceneDto) {
    const { userId } = req.user as { userId: string };
    return this.scenesService.create(storyId, userId, dto);
  }

  @Patch('stories/:storyId/scenes/:sceneId')
  update(
    @Param('storyId') storyId: string,
    @Param('sceneId') sceneId: string,
    @Req() req: any,
    @Body() dto: UpdateSceneDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.scenesService.update(sceneId, userId, dto);
  }

  @Patch('stories/:storyId/scenes/:sceneId/active-version')
  setActiveVersion(
    @Param('storyId') storyId: string,
    @Param('sceneId') sceneId: string,
    @Req() req: any,
    @Body() dto: SetSceneActiveVersionDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.scenesService.setActiveVersion(sceneId, userId, dto.activeVersionId);
  }

  @Delete('stories/:storyId/scenes/:sceneId')
  @HttpCode(204)
  async remove(
    @Param('storyId') storyId: string,
    @Param('sceneId') sceneId: string,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    await this.scenesService.delete(sceneId, userId);
  }

  @Get('scenes/:sceneId/notes')
  listNotes(@Param('sceneId') sceneId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.scenesService.listNotes(sceneId, userId);
  }

  @Post('scenes/:sceneId/notes')
  createNote(
    @Param('sceneId') sceneId: string,
    @Req() req: any,
    @Body() dto: CreateSceneNoteDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.scenesService.createNote(sceneId, userId, dto);
  }

  @Patch('scenes/:sceneId/notes/:noteId')
  updateNote(
    @Param('sceneId') sceneId: string,
    @Param('noteId') noteId: string,
    @Req() req: any,
    @Body() dto: UpdateSceneNoteDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.scenesService.updateNote(noteId, userId, dto);
  }

  @Delete('scenes/:sceneId/notes/:noteId')
  @HttpCode(204)
  async removeNote(
    @Param('sceneId') sceneId: string,
    @Param('noteId') noteId: string,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    await this.scenesService.deleteNote(noteId, userId);
  }

  @Post('scenes/:sceneId/analyze')
  async enqueueAnalysis(@Param('sceneId') sceneId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    await this.scenesService.assertOwnership(sceneId, userId);

    const result = await this.intelligenceOrchestrator.enqueueSceneAnalysis(
      sceneId,
      userId,
    );

    return {
      queued: result.queued,
      sceneId,
      reason: result.reason,
      inputId: result.input.id,
    };
  }
}
