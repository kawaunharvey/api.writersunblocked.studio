import { PlatformAction } from "./platform.types";
import { transformExtractionToActions } from "./platform.transform";
import type { PlatformExtractionResponse, PlatformStoryContext } from "./platform.types";

const emptyContext: PlatformStoryContext = {
  mentions: [],
  keyDetailTemplates: {
    person: [{ label: "Full Name", type: "text" }],
    place: [{ label: "Name", type: "text" }],
    thing: [{ label: "Name", type: "text" }],
  },
  scenes: [],
  notes: [],
};

const marcusContext: PlatformStoryContext = {
  ...emptyContext,
  mentions: [
    {
      id: "mention_marcus_id",
      name: "Marcus",
      type: "person",
      aliases: ["Marcus Kensington"],
      keyDetails: { "Full Name": "Marcus Kensington" },
    },
  ],
};

describe("transformExtractionToActions", () => {
  it("maps Marcus note extraction to mention, scene, and source note actions", () => {
    const extraction: PlatformExtractionResponse = {
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
          matchReason: "Named directly",
          keyDetailUpdates: [
            {
              label: "Psychology",
              value: "Wants more from his father",
              fieldType: "text",
              evidence: "Marcus wants more from his father",
            },
          ],
        },
        {
          ref: "e2",
          name: "Marcus's father",
          type: "person",
          resolution: "new",
          matchedMentionId: null,
          matchReason: "Relational reference",
          keyDetailUpdates: [
            {
              label: "Relationships",
              value: "Rejects Marcus's attempts to connect",
              fieldType: "text",
            },
          ],
        },
      ],
      proposedScenes: [
        {
          summary:
            "Marcus tries to get his need met by his father but is rejected again",
          entityRefs: ["e1", "e2"],
          trigger: "explicit",
        },
      ],
      residualNotes: [],
    };

    const result = transformExtractionToActions(extraction, marcusContext, 24);

    expect(result.meta.entityCount).toBe(2);
    expect(result.actions[0]?.action).toBe(PlatformAction.UPDATE_MENTION);
    expect(result.actions[0]?.data.find((f) => f.label === "#StoryLabel")?.value).toBe(
      "Marcus",
    );
    expect(result.actions[0]?.data.find((f) => f.label === "#MentionId")?.value).toBe(
      "mention_marcus_id",
    );

    expect(result.actions.some((a) => a.action === PlatformAction.NEW_MENTION)).toBe(
      true,
    );
    expect(result.actions.some((a) => a.action === PlatformAction.NEW_SCENE)).toBe(true);

    const sourceNote = result.actions.at(-1);
    expect(sourceNote?.action).toBe(PlatformAction.NEW_NOTE);
    expect(sourceNote?.data.find((f) => f.label === "#NoteShortId")).toBeDefined();
  });

  it("maps Georgia Ghost extraction to new mention cards with key details", () => {
    const extraction: PlatformExtractionResponse = {
      sourceNote: {
        text: "Georgia pulls Lottie from the grave in her first act as a reconstituted ghost.",
        entityRefs: ["e1"],
      },
      entities: [
        {
          ref: "e1",
          name: "Georgia Ghost",
          type: "person",
          resolution: "new",
          matchedMentionId: null,
          matchReason: "New ghost character",
          keyDetailUpdates: [
            { label: "Full Name", value: "Georgia Diana DiMattia", fieldType: "text" },
            { label: "Age", value: 26, fieldType: "number" },
            { label: "Species", value: "Ghost", fieldType: "text" },
            {
              label: "Powers",
              value: ["Walks through walls", "Telekinetic connection to Lottie"],
              fieldType: "option",
            },
          ],
        },
      ],
      proposedScenes: [],
      residualNotes: [],
    };

    const result = transformExtractionToActions(extraction, emptyContext, 15);

    const mentionAction = result.actions.find(
      (action) => action.action === PlatformAction.NEW_MENTION,
    );
    expect(mentionAction?.data.find((f) => f.label === "#StoryLabel")?.value).toBe(
      "Georgia Ghost",
    );
    expect(mentionAction?.data.find((f) => f.label === "#MentionType")?.value).toBe(
      "person",
    );
    expect(mentionAction?.data.find((f) => f.label === "Age")?.value).toBe(26);
  });

  it("downgrades invalid matchedMentionId to new mention", () => {
    const extraction: PlatformExtractionResponse = {
      sourceNote: { text: "Marcus returns to the city.", entityRefs: ["e1"] },
      entities: [
        {
          ref: "e1",
          name: "Marcus",
          type: "person",
          resolution: "existing",
          matchedMentionId: "invalid_id",
          matchReason: "Name match",
          keyDetailUpdates: [
            { label: "Arc", value: "Returns home", fieldType: "text" },
          ],
        },
      ],
      proposedScenes: [],
      residualNotes: [],
    };

    const result = transformExtractionToActions(extraction, marcusContext, 4);
    expect(result.actions[0]?.action).toBe(PlatformAction.NEW_MENTION);
    expect(
      result.actions[0]?.data.find((f) => f.label === "#MentionId"),
    ).toBeUndefined();
  });

  it("maps matched scene to update_scene", () => {
    const context: PlatformStoryContext = {
      ...emptyContext,
      scenes: [
        {
          id: "scene_1",
          label: "Graveyard",
          summary: "Georgia at the grave",
          shortId: "abc123",
        },
      ],
    };

    const extraction: PlatformExtractionResponse = {
      sourceNote: { text: "Expand the graveyard scene.", entityRefs: [] },
      entities: [],
      proposedScenes: [
        {
          summary: "Lottie questions everything at the grave",
          entityRefs: [],
          trigger: "explicit",
          matchedSceneId: "scene_1",
        },
      ],
      residualNotes: [],
    };

    const result = transformExtractionToActions(extraction, context, 4);
    expect(result.actions[0]?.action).toBe(PlatformAction.UPDATE_SCENE);
    expect(result.actions[0]?.data.find((f) => f.label === "#SceneId")?.value).toBe(
      "scene_1",
    );
  });

  it("maps matched note to update_note and skips duplicate residual source text", () => {
    const noteText = "Actually Marcus is 27, not 26.";
    const context: PlatformStoryContext = {
      ...emptyContext,
      notes: [{ id: "note_1", preview: noteText }],
    };

    const extraction: PlatformExtractionResponse = {
      sourceNote: { text: noteText, entityRefs: [] },
      entities: [],
      proposedScenes: [],
      residualNotes: [
        {
          text: noteText,
          entityRefs: [],
          matchedNoteId: "note_1",
        },
      ],
    };

    const result = transformExtractionToActions(extraction, context, 7);
    const noteActions = result.actions.filter((a) =>
      [PlatformAction.NEW_NOTE, PlatformAction.UPDATE_NOTE].includes(a.action),
    );

    expect(noteActions).toHaveLength(1);
    expect(noteActions[0]?.action).toBe(PlatformAction.NEW_NOTE);
  });
});
