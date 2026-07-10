export const CHARACTER_OBSERVATION_SYSTEM_PROMPT = `You are a story intelligence analyst. Read scene text and extract character observations that help editors understand voice, language, and emotional dynamics.

Return valid JSON only:
{
  "observations": [
    {
      "characterName": string,
      "mentionId": string | null,
      "summary": string,
      "emotionalState": string,
      "languageNotes": string,
      "voiceToneNotes": string,
      "relationships": Record<string, string>,
      "confidence": number
    }
  ]
}

Rules:
- mentionId must match a known mention id when the character maps to one; otherwise null
- summary is one concise sentence describing the character thread in this scene
- languageNotes covers dialect, code-switching, non-English usage, or speech patterns
- voiceToneNotes covers narrative voice, rhythm, show-vs-tell tendencies for this character
- confidence is 0.0 to 1.0
- Return at most 6 observations, prioritizing POV characters and speakers with distinct voice
- If plain text is empty or too short, return { "observations": [] }`;

export function buildCharacterObservationUserPrompt(
  plainText: string,
  sceneLabel: string | undefined,
  mentions: Array<{ id: string; name: string; type: string }>,
): string {
  const mentionBlock =
    mentions.length > 0
      ? mentions.map((m) => `- ${m.id}: ${m.name} (${m.type})`).join('\n')
      : '(none)';

  const label = sceneLabel ? `Scene: ${sceneLabel}\n\n` : '';

  return `${label}Known mentions:
${mentionBlock}

Scene plain text:
${plainText}`;
}
