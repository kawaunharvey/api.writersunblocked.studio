import { Injectable } from '@nestjs/common';
import { PlatformService } from '../platform/platform.service';
import { ScenesService } from '../scenes/scenes.service';
import { CopyEditorService } from './copy-editor.service';
import type { EditorAnalysisResult, LineEditorFeedbackResult } from './editor-analysis.types';
import { LineEditorService } from './line-editor.service';

@Injectable()
export class EditorAnalysisService {
  constructor(
    private readonly scenesService: ScenesService,
    private readonly copyEditorService: CopyEditorService,
    private readonly lineEditorService: LineEditorService,
    private readonly platformService: PlatformService,
  ) {}

  async analyzeCopy(
    storyId: string,
    sceneId: string,
    userId: string,
    plainText: string,
  ): Promise<EditorAnalysisResult> {
    await this.scenesService.assertOwnership(sceneId, userId);
    return this.copyEditorService.analyze(sceneId, plainText);
  }

  async analyzeLine(
    storyId: string,
    sceneId: string,
    userId: string,
    plainText: string,
  ): Promise<EditorAnalysisResult> {
    const scene = await this.scenesService.assertOwnership(sceneId, userId);
    return this.lineEditorService.analyze(sceneId, plainText, scene.label ?? undefined);
  }

  async respondToLineSuggestion(
    storyId: string,
    sceneId: string,
    suggestionId: string,
    userId: string,
    userInput: string,
  ): Promise<LineEditorFeedbackResult> {
    await this.scenesService.assertOwnership(sceneId, userId);
    const platformResult = await this.platformService.translateToPlatform(
      storyId,
      userId,
      userInput,
    );

    return {
      suggestionId,
      platformActions: platformResult.translation,
    };
  }
}
