import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PlatformModule } from '../platform/platform.module';
import { ScenesModule } from '../scenes/scenes.module';
import { StoryIntelligenceModule } from '../story-intelligence/story-intelligence.module';
import { CopyEditorAiService } from './copy-editor-ai.service';
import { CopyEditorService } from './copy-editor.service';
import { EditorAnalysisController } from './editor-analysis.controller';
import { EditorAnalysisService } from './editor-analysis.service';
import { LanguageToolClient } from './languagetool.client';
import { LineEditorService } from './line-editor.service';

@Module({
  imports: [ScenesModule, AiModule, PlatformModule, StoryIntelligenceModule],
  controllers: [EditorAnalysisController],
  providers: [
    EditorAnalysisService,
    CopyEditorService,
    CopyEditorAiService,
    LineEditorService,
    LanguageToolClient,
  ],
  exports: [EditorAnalysisService],
})
export class EditorAnalysisModule {}
