import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { AnalyzeSceneDto, LineEditorRespondDto } from './editor-analysis.dto';
import { EditorAnalysisService } from './editor-analysis.service';

@Controller()
export class EditorAnalysisController {
  constructor(private readonly editorAnalysisService: EditorAnalysisService) {}

  @Post('stories/:storyId/scenes/:sceneId/analyze/copy')
  analyzeCopy(
    @Param('storyId') storyId: string,
    @Param('sceneId') sceneId: string,
    @Req() req: { user: { userId: string } },
    @Body() dto: AnalyzeSceneDto,
  ) {
    return this.editorAnalysisService.analyzeCopy(
      storyId,
      sceneId,
      req.user.userId,
      dto.plainText,
    );
  }

  @Post('stories/:storyId/scenes/:sceneId/analyze/line')
  analyzeLine(
    @Param('storyId') storyId: string,
    @Param('sceneId') sceneId: string,
    @Req() req: { user: { userId: string } },
    @Body() dto: AnalyzeSceneDto,
  ) {
    return this.editorAnalysisService.analyzeLine(
      storyId,
      sceneId,
      req.user.userId,
      dto.plainText,
    );
  }

  @Post('stories/:storyId/scenes/:sceneId/analyze/line/:suggestionId/respond')
  respondToLineSuggestion(
    @Param('storyId') storyId: string,
    @Param('sceneId') sceneId: string,
    @Param('suggestionId') suggestionId: string,
    @Req() req: { user: { userId: string } },
    @Body() dto: LineEditorRespondDto,
  ) {
    return this.editorAnalysisService.respondToLineSuggestion(
      storyId,
      sceneId,
      suggestionId,
      req.user.userId,
      dto.userInput,
    );
  }
}
