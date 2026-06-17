import schema from "./platform.schema.json";
import type { PlatformStoryContext } from "./platform.types";

const MARCUS_EXAMPLE = {
  sourceNote: {
    text: "Marcus wants more from his father, i should create a scene where he tries to get his need met but gets rejected again",
    entityRefs: ["e1", "e2"],
  },
  entities: [
    {
      ref: "e1",
      name: "Marcus",
      type: "person",
      resolution: "existing",
      matchedMentionId: "mention_marcus_id",
      matchReason: "Named directly in the note",
      keyDetailUpdates: [
        {
          label: "Psychology",
          value: "Wants more from his father",
          fieldType: "text",
          evidence: "Marcus wants more from his father",
        },
        {
          label: "Relationships",
          value: "Seeking approval from his father",
          fieldType: "text",
          evidence: "wants more from his father",
        },
      ],
    },
    {
      ref: "e2",
      name: "Marcus's father",
      type: "person",
      resolution: "new",
      matchedMentionId: null,
      matchReason: "Relational reference to an unnamed father figure",
      keyDetailUpdates: [
        {
          label: "Relationships",
          value: "Father who rejects Marcus's attempts to connect",
          fieldType: "text",
          evidence: "gets rejected again",
        },
      ],
    },
  ],
  proposedScenes: [
    {
      summary:
        "Marcus tries to get his emotional need met by his father but is rejected again",
      entityRefs: ["e1", "e2"],
      trigger: "explicit",
      matchedSceneId: null,
    },
  ],
  residualNotes: [],
};

const GEORGIA_EXAMPLE = {
  sourceNote: {
    text: "Georgia pulls Lottie from the grave in her first act as a reconstituted ghost. Lottie questions everything.",
    entityRefs: ["e1", "e2"],
  },
  entities: [
    {
      ref: "e1",
      name: "Georgia Ghost",
      type: "person",
      resolution: "new",
      matchedMentionId: null,
      matchReason: "New character acting in the scene",
      keyDetailUpdates: [
        {
          label: "Full Name",
          value: "Georgia Diana DiMattia",
          fieldType: "text",
          evidence: "Georgia",
        },
        {
          label: "Age",
          value: 26,
          fieldType: "number",
          evidence: "inferred young adult ghost",
        },
        {
          label: "Species",
          value: "Ghost",
          fieldType: "text",
          evidence: "reconstituted ghost",
        },
        {
          label: "Powers",
          value: ["Walks through walls", "Telekinetic connection to Lottie"],
          fieldType: "option",
          evidence: "pulls Lottie from the grave",
        },
      ],
    },
    {
      ref: "e2",
      name: "Lottie",
      type: "person",
      resolution: "new",
      matchedMentionId: null,
      matchReason: "Named character pulled from the grave",
      keyDetailUpdates: [
        {
          label: "Relationships",
          value: "Connected to Georgia; pulled from the grave by her",
          fieldType: "text",
          evidence: "Georgia pulls Lottie from the grave",
        },
      ],
    },
  ],
  proposedScenes: [
    {
      summary:
        "Georgia pulls Lottie from the grave in her first act as a reconstituted ghost; Lottie begins questioning everything",
      entityRefs: ["e1", "e2"],
      trigger: "inferred",
      matchedSceneId: null,
    },
  ],
  residualNotes: [],
};

export function buildSystemPrompt(): string {
  return `
You are a story development assistant. Read writer notes and extract actionable story intelligence.

Return strict valid JSON only with this exact shape: ${JSON.stringify(schema)}

Few-shot examples:

Example 1 (existing mention update + new mention + explicit scene):
${JSON.stringify(MARCUS_EXAMPLE, null, 2)}

Example 2 (new mentions with key details + inferred scene):
${JSON.stringify(GEORGIA_EXAMPLE, null, 2)}

Processing steps (follow mentally; output JSON only):
1. Identify intent: character development, relationship, scene idea, world detail, or general planning.
2. Extract named entities and relational references ("his father", "the museum") as person, place, or thing.
3. Resolve each entity against Existing mentions — use existing when name or alias matches; use ambiguous when confidence is low.
4. Emit keyDetailUpdates only when the note provides evidence, using labels from Key detail field templates.
5. Emit proposedScenes when the user explicitly plans a scene ("I should create a scene where…") or describes a dramatizable moment.
6. Capture sourceNote verbatim (trimmed) with linked entity refs.
7. Use matchedSceneId when a proposed scene clearly updates an existing scene from context.
8. Use matchedNoteId in residualNotes only when revising an existing note from context.

Rules:
- Do not invent facts not supported by the note or existing mention data.
- Do not include entities with empty keyDetailUpdates unless resolution is new and the entity is clearly introduced.
- Deduplicate entities (same character mentioned twice → one ref).
- Unnamed relational entities ("his father") → resolution new with a descriptive name, or ambiguous if unclear.
- fieldType option only when the template supports options and the note supports a choice.
- Keep arrays concise; prefer quality over quantity.
- Do not wrap JSON in markdown fences.
`.trim();
}

export function buildUserPrompt(
  body: string,
  context: PlatformStoryContext,
): string {
  return `
Analyze the writer's note using the story context below.

## Existing mentions
${JSON.stringify(context.mentions, null, 2)}

## Existing scenes
${JSON.stringify(context.scenes, null, 2)}

## Existing notes
${JSON.stringify(context.notes, null, 2)}

## Key detail field templates
${JSON.stringify(context.keyDetailTemplates, null, 2)}

## User note
${body.trim()}
`.trim();
}
