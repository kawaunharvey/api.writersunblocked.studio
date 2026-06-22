import { AppConfigService } from '@/common/config/app-config.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CopyEditorAiService } from './copy-editor-ai.service';
import type {
  EditorAnalysisResult,
  EditorSuggestionItem,
  LanguageToolMatch,
} from './editor-analysis.types';
import { LanguageToolClient, LanguageToolUnavailableError } from './languagetool.client';

function mapIssueTypeToCategory(issueType: string): EditorSuggestionItem['category'] {
  const normalized = issueType.toLowerCase();
  if (normalized.includes('misspelling') || normalized.includes('typographical')) {
    return 'spelling';
  }
  if (normalized.includes('grammar')) {
    return 'grammar';
  }
  if (normalized.includes('punctuation')) {
    return 'punctuation';
  }
  return 'style';
}

function mapIssueTypeToSeverity(issueType: string): EditorSuggestionItem['severity'] {
  const normalized = issueType.toLowerCase();
  if (normalized.includes('misspelling')) {
    return 'error';
  }
  if (normalized.includes('grammar')) {
    return 'warning';
  }
  return 'info';
}

function mapMatchToSuggestion(
  sceneId: string,
  plainText: string,
  match: LanguageToolMatch,
): EditorSuggestionItem {
  const affectedText = plainText.slice(match.offset, match.offset + match.length);
  return {
    id: randomUUID(),
    editorMode: 'copy',
    category: mapIssueTypeToCategory(match.rule.issueType),
    severity: mapIssueTypeToSeverity(match.rule.issueType),
    cardType: 'fix',
    sceneId,
    charOffset: match.offset,
    charLength: match.length,
    affectedText,
    message: match.message,
    replacements: match.replacements.map((replacement) => replacement.value).slice(0, 5),
  };
}

@Injectable()
export class CopyEditorService {
  constructor(
    private readonly config: AppConfigService,
    private readonly languageTool: LanguageToolClient,
    private readonly copyEditorAi: CopyEditorAiService,
  ) {}

  async analyze(sceneId: string, plainText: string): Promise<EditorAnalysisResult> {
    if (this.config.copyEditorAiEnabled) {
      return this.copyEditorAi.analyze(sceneId, plainText);
    }

    if (!plainText.trim()) {
      return {
        sceneId,
        editorMode: 'copy',
        suggestions: [],
        analyzedAt: new Date().toISOString(),
        provider: 'languagetool',
      };
    }

    try {
      const response = await this.languageTool.check(plainText);
      const suggestions = response.matches.map((match) =>
        mapMatchToSuggestion(sceneId, plainText, match),
      );

      return {
        sceneId,
        editorMode: 'copy',
        suggestions,
        analyzedAt: new Date().toISOString(),
        provider: 'languagetool',
      };
    } catch (error) {
      if (error instanceof LanguageToolUnavailableError) {
        throw new ServiceUnavailableException(
          'Copy editor is unavailable. Start LanguageTool with "yarn dev:services" in the API repo.',
        );
      }

      throw error;
    }
  }
}
