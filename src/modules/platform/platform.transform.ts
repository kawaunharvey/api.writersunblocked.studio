import {
  PlatformAction,
  type KeyDetailUpdate,
  type PlatformActionField,
  type PlatformActionItem,
  type PlatformActionResponse,
  type PlatformExtractionResponse,
  type PlatformStoryContext,
} from "./platform.types";
import { generateShortId } from "./platform.utils";

function toActionField(update: KeyDetailUpdate): PlatformActionField {
  return {
    label: update.label,
    type: update.fieldType,
    value: update.value,
  };
}

function hasValue(value: string | number | string[] | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return true;
  return value.length > 0;
}

function mergeMentionUpdates(
  actions: PlatformActionItem[],
  candidate: PlatformActionItem,
): void {
  const mentionId = candidate.data.find((field) => field.label === "#MentionId")
    ?.value;
  const storyLabel = candidate.data.find(
    (field) => field.label === "#StoryLabel",
  )?.value;

  const existing = actions.find((action) => {
    if (action.action !== candidate.action) return false;
    const actionMentionId = action.data.find(
      (field) => field.label === "#MentionId",
    )?.value;
    const actionStoryLabel = action.data.find(
      (field) => field.label === "#StoryLabel",
    )?.value;
    if (mentionId && actionMentionId) return mentionId === actionMentionId;
    return storyLabel === actionStoryLabel;
  });

  if (!existing) {
    actions.push(candidate);
    return;
  }

  const labels = new Set(
    existing.data.filter((field) => !field.label.startsWith("#")).map((f) => f.label),
  );
  for (const field of candidate.data) {
    if (field.label.startsWith("#") || labels.has(field.label)) continue;
    existing.data.push(field);
    labels.add(field.label);
  }
}

export function transformExtractionToActions(
  extraction: PlatformExtractionResponse,
  context: PlatformStoryContext,
  wordCount: number,
): PlatformActionResponse {
  const actions: PlatformActionItem[] = [];
  const validMentionIds = new Set(context.mentions.map((mention) => mention.id));
  const validSceneIds = new Set(context.scenes.map((scene) => scene.id));
  const validNoteIds = new Set(context.notes.map((note) => note.id));

  for (const entity of extraction.entities) {
    const updates = entity.keyDetailUpdates.filter((update) =>
      hasValue(update.value),
    );

    let resolution = entity.resolution;
    let matchedMentionId = entity.matchedMentionId;

    if (
      resolution === "existing" &&
      matchedMentionId &&
      !validMentionIds.has(matchedMentionId)
    ) {
      resolution = "new";
      matchedMentionId = null;
    }

    const existingMention = matchedMentionId
      ? context.mentions.find((mention) => mention.id === matchedMentionId)
      : undefined;
    const storyLabel = existingMention?.name ?? entity.name;

    if (resolution === "existing" && matchedMentionId && updates.length > 0) {
      mergeMentionUpdates(actions, {
        action: PlatformAction.UPDATE_MENTION,
        body:
          updates
            .map((update) => update.evidence ?? String(update.value))
            .join(". ") || `Update details for ${storyLabel}`,
        data: [
          { label: "#StoryLabel", type: "text", value: storyLabel },
          { label: "#MentionId", type: "text", value: matchedMentionId },
          ...updates.map(toActionField),
        ],
      });
      continue;
    }

    if (resolution === "new" || resolution === "ambiguous") {
      if (updates.length === 0 && resolution === "ambiguous") continue;

      const data: PlatformActionField[] = [
        { label: "#StoryLabel", type: "text", value: entity.name },
        { label: "#MentionType", type: "text", value: entity.type },
      ];

      if (resolution === "ambiguous") {
        data.push({ label: "#NeedsReview", type: "text", value: "true" });
      }

      data.push(...updates.map(toActionField));

      mergeMentionUpdates(actions, {
        action: PlatformAction.NEW_MENTION,
        body: entity.matchReason || `New ${entity.type}: ${entity.name}`,
        data,
      });
    }
  }

  for (const scene of extraction.proposedScenes) {
    const matchedSceneId =
      scene.matchedSceneId && validSceneIds.has(scene.matchedSceneId)
        ? scene.matchedSceneId
        : null;

    if (matchedSceneId) {
      actions.push({
        action: PlatformAction.UPDATE_SCENE,
        body: scene.summary,
        data: [
          { label: "#SceneId", type: "text", value: matchedSceneId },
          { label: "Summary", type: "text", value: scene.summary },
        ],
      });
      continue;
    }

    actions.push({
      action: PlatformAction.NEW_SCENE,
      body: scene.summary,
      data: [{ label: "Summary", type: "text", value: scene.summary }],
    });
  }

  const sourceText = extraction.sourceNote?.text?.trim() ?? "";

  for (const note of extraction.residualNotes) {
    const text = note.text.trim();
    if (!text || text === sourceText) continue;

    const matchedNoteId =
      note.matchedNoteId && validNoteIds.has(note.matchedNoteId)
        ? note.matchedNoteId
        : null;

    if (matchedNoteId) {
      actions.push({
        action: PlatformAction.UPDATE_NOTE,
        body: text,
        data: [
          { label: "#NoteId", type: "text", value: matchedNoteId },
          { label: "Body", type: "text", value: text },
        ],
      });
      continue;
    }

    actions.push({
      action: PlatformAction.NEW_NOTE,
      body: text,
      data: [
        { label: "#NoteShortId", type: "text", value: generateShortId() },
        { label: "Body", type: "text", value: text },
      ],
    });
  }

  if (sourceText) {
    actions.push({
      action: PlatformAction.NEW_NOTE,
      body: sourceText,
      data: [
        { label: "#NoteShortId", type: "text", value: generateShortId() },
        { label: "Body", type: "text", value: sourceText },
      ],
    });
  }

  return {
    actions,
    meta: {
      wordCount,
      entityCount: extraction.entities.length,
    },
  };
}

export async function sanitizePlatformTransformation(
  extraction: PlatformExtractionResponse,
  context: PlatformStoryContext,
  wordCount: number,
): Promise<PlatformActionResponse> {
  return transformExtractionToActions(extraction, context, wordCount);
}
