import type { StoryIntelligenceContext } from '../story-intelligence/story-intelligence.types';

export const LINE_EDITOR_SYSTEM_PROMPT = `You are a line editor for fiction. Analyze the provided scene text and return editorial feedback as JSON only.

Evaluate these domains:
- voice-tone: voice and tone consistency
- rhythm-pacing: sentence rhythm and pacing
- word-precision: word-level precision
- show-tell: show versus tell detection
- dialogue: dialogue quality
- redundancy: redundancy and bloat
- transition-flow: transition and flow

Return valid JSON matching this schema:
{
  "suggestions": [
    {
      "category": "voice-tone" | "rhythm-pacing" | "word-precision" | "show-tell" | "dialogue" | "redundancy" | "transition-flow",
      "severity": "error" | "warning" | "info",
      "affectedText": string,
      "message": string,
      "prompt": string,
      "platformHint": { "entityRefs": string[], "sceneRef": string }
    }
  ]
}

Rules:
- affectedText must be an exact substring copied from the plain text provided
- affectedText should be the shortest passage that clearly shows the issue, usually one sentence or phrase
- Do not include line breaks inside affectedText unless the issue spans a hard line break
- Return at most 8 suggestions, prioritizing the most impactful
- prompt should be a concise question or suggestion for the writer
- platformHint.entityRefs may name characters or entities mentioned in the passage
- When story world context is provided, use it to keep feedback authentic to the established world
- Do not flag intentional language choices, dialect, code-switching, or voice patterns established in story context
- If no issues found, return { "suggestions": [] }`;

function buildStoryWorldSection(context?: StoryIntelligenceContext): string {
  if (!context) {
    return '';
  }

  const lines: string[] = [];

  for (const note of context.canon.characterNotes) {
    const language =
      typeof note.body.languageNotes === 'string' ? note.body.languageNotes : '';
    const voice =
      typeof note.body.voiceToneNotes === 'string' ? note.body.voiceToneNotes : '';
    const parts = [note.summary, language, voice].filter(Boolean);
    if (parts.length > 0) {
      lines.push(`- ${note.name}: ${parts.join('; ')}`);
    }
  }

  for (const rule of context.canon.worldRules) {
    lines.push(`- Canon rule: ${rule}`);
  }

  for (const tone of context.canon.toneNotes) {
    lines.push(`- Tone: ${tone}`);
  }

  if (lines.length === 0) {
    return '';
  }

  return `Story world context (keep feedback authentic to this world):\n${lines.join('\n')}\n\n`;
}

export function buildLineEditorUserPrompt(
  plainText: string,
  sceneLabel?: string,
  context?: StoryIntelligenceContext,
): string {
  const label = sceneLabel ? `Scene: ${sceneLabel}\n\n` : '';
  const world = buildStoryWorldSection(context);
  return `${label}${world}Plain text:\n${plainText}`;
}
