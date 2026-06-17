import type { PlatformExtractionResponse } from "./platform.types";

export function parseExtractionResponse(raw: string): PlatformExtractionResponse {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const tryParse = (value: string): PlatformExtractionResponse => {
    return JSON.parse(value) as PlatformExtractionResponse;
  };

  try {
    return normalizeExtraction(tryParse(withoutFence));
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return normalizeExtraction(tryParse(withoutFence.slice(start, end + 1)));
    }

    throw new Error("Invalid platform extraction response");
  }
}

function normalizeExtraction(
  parsed: PlatformExtractionResponse,
): PlatformExtractionResponse {
  return {
    sourceNote: parsed.sourceNote ?? { text: "", entityRefs: [] },
    entities: parsed.entities ?? [],
    proposedScenes: parsed.proposedScenes ?? [],
    residualNotes: parsed.residualNotes ?? [],
  };
}
