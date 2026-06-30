import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ProviderService } from '../ai/provider.service';
import type {
  EditorAnalysisResult,
  EditorSuggestionItem,
  LineEditorAiResponse,
} from './editor-analysis.types';
import { buildLineEditorUserPrompt, LINE_EDITOR_SYSTEM_PROMPT } from './line-editor.prompt';

function extractJson(raw: string): LineEditorAiResponse {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(candidate) as LineEditorAiResponse;

  if (!Array.isArray(parsed.suggestions)) {
    throw new Error('Line editor AI response missing suggestions array');
  }

  return parsed;
}

@Injectable()
export class LineEditorService {
  private readonly logger = new Logger(LineEditorService.name);

  constructor(private readonly provider: ProviderService) {}

  async analyze(
    sceneId: string,
    plainText: string,
    sceneLabel?: string,
  ): Promise<EditorAnalysisResult> {
    if (!plainText.trim()) {
      return {
        sceneId,
        editorMode: 'line',
        suggestions: [],
        analyzedAt: new Date().toISOString(),
        provider: 'ai',
      };
    }

    try {
      const userPrompt = buildLineEditorUserPrompt(plainText, sceneLabel);
      const raw = await this.provider.complete(userPrompt, LINE_EDITOR_SYSTEM_PROMPT);
      const parsed = extractJson(raw);

      const suggestions: EditorSuggestionItem[] = parsed.suggestions.flatMap((item) => {
        const affectedText = item.affectedText?.trim();
        if (!affectedText) {
          return [];
        }

        const charOffset = plainText.indexOf(affectedText);
        if (charOffset === -1) {
          this.logger.warn(
            `Line editor suggestion skipped: affectedText not found in scene ${sceneId}`,
          );
          return [];
        }

        return [
          {
            id: randomUUID(),
            editorMode: 'line' as const,
            category: item.category,
            severity: item.severity,
            cardType: 'feedback' as const,
            sceneId,
            charOffset,
            charLength: affectedText.length,
            affectedText,
            message: item.message,
            prompt: item.prompt,
            platformHint: item.platformHint,
          },
        ];
      });

      return {
        sceneId,
        editorMode: 'line',
        suggestions,
        analyzedAt: new Date().toISOString(),
        provider: 'ai',
      };
    } catch (error) {
      this.logger.error('Line editor analysis failed', error);
      return {
        sceneId,
        editorMode: 'line',
        suggestions: [],
        analyzedAt: new Date().toISOString(),
        provider: 'ai',
      };
    }
  }
}
