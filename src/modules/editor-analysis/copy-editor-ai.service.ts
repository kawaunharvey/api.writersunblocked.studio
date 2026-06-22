import { Injectable, Logger } from '@nestjs/common';
import type { EditorAnalysisResult } from './editor-analysis.types';

@Injectable()
export class CopyEditorAiService {
  private readonly logger = new Logger(CopyEditorAiService.name);

  async analyze(sceneId: string, _plainText: string): Promise<EditorAnalysisResult> {
    this.logger.warn('CopyEditorAiService is a tier-2 placeholder and not implemented yet');
    return {
      sceneId,
      editorMode: 'copy',
      suggestions: [],
      analyzedAt: new Date().toISOString(),
      provider: 'ai-placeholder',
    };
  }
}
