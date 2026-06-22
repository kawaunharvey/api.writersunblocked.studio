export type EditorModeKind = 'copy' | 'line';

export type SuggestionCategory =
  | 'spelling'
  | 'grammar'
  | 'punctuation'
  | 'style'
  | 'voice-tone'
  | 'rhythm-pacing'
  | 'word-precision'
  | 'show-tell'
  | 'dialogue'
  | 'redundancy'
  | 'transition-flow';

export type SuggestionSeverity = 'error' | 'warning' | 'info';

export type SuggestionCardType = 'fix' | 'feedback';

export type SuggestionProvider = 'languagetool' | 'ai' | 'ai-placeholder';

export interface EditorSuggestionItem {
  id: string;
  editorMode: EditorModeKind;
  category: SuggestionCategory;
  severity: SuggestionSeverity;
  cardType: SuggestionCardType;
  sceneId: string;
  charOffset: number;
  charLength: number;
  affectedText: string;
  message: string;
  replacements?: string[];
  prompt?: string;
  platformHint?: {
    entityRefs?: string[];
    sceneRef?: string;
  };
}

export interface EditorAnalysisResult {
  sceneId: string;
  editorMode: EditorModeKind;
  suggestions: EditorSuggestionItem[];
  analyzedAt: string;
  provider: SuggestionProvider;
}

export interface LineEditorFeedbackResult {
  suggestionId: string;
  platformActions: unknown;
}

export interface LanguageToolMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: Array<{ value: string }>;
  rule: {
    id: string;
    issueType: string;
    category: { id: string; name: string };
  };
}

export interface LanguageToolResponse {
  matches: LanguageToolMatch[];
}

export interface LineEditorAiSuggestion {
  category: SuggestionCategory;
  severity: SuggestionSeverity;
  charOffset: number;
  charLength: number;
  message: string;
  prompt?: string;
  platformHint?: {
    entityRefs?: string[];
    sceneRef?: string;
  };
}

export interface LineEditorAiResponse {
  suggestions: LineEditorAiSuggestion[];
}
