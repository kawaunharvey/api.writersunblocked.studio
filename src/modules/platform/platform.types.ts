export type MentionType = "person" | "place" | "thing";

export type EntityResolution = "new" | "existing" | "ambiguous";

export type DynamicFieldType = "text" | "number" | "option";

export enum PlatformAction {
  NEW_MENTION = "new_mention",
  UPDATE_MENTION = "update_mention",
  NEW_SCENE = "new_scene",
  UPDATE_SCENE = "update_scene",
  NEW_NOTE = "new_note",
  UPDATE_NOTE = "update_note",
}

export interface KeyDetailUpdate {
  label: string;
  value: string | number | string[];
  fieldType: DynamicFieldType;
  evidence?: string;
}

export interface ExtractedEntity {
  ref: string;
  name: string;
  type: MentionType;
  resolution: EntityResolution;
  matchedMentionId: string | null;
  matchReason: string;
  keyDetailUpdates: KeyDetailUpdate[];
}

export interface ProposedScene {
  summary: string;
  entityRefs: string[];
  trigger: "explicit" | "inferred";
  matchedSceneId?: string | null;
}

export interface ResidualNote {
  text: string;
  entityRefs: string[];
  matchedNoteId?: string | null;
}

export interface PlatformExtractionResponse {
  sourceNote: {
    text: string;
    entityRefs: string[];
  };
  entities: ExtractedEntity[];
  proposedScenes: ProposedScene[];
  residualNotes: ResidualNote[];
}

export interface PlatformActionField {
  label: string;
  type: DynamicFieldType;
  value: string | number | string[];
}

export interface PlatformActionItem {
  action: PlatformAction;
  body: string;
  data: PlatformActionField[];
}

export interface PlatformActionResponse {
  actions: PlatformActionItem[];
  meta: {
    wordCount: number;
    entityCount: number;
  };
}

export interface StoryMentionContext {
  id: string;
  name: string;
  type: MentionType;
  aliases: string[];
  keyDetails: Record<string, string>;
}

export interface KeyDetailTemplate {
  label: string;
  type: DynamicFieldType;
  context?: string;
  options?: string[];
}

export interface StorySceneContext {
  id: string;
  label: string | null;
  summary: string | null;
  shortId: string;
}

export interface StoryNoteContext {
  id: string;
  preview: string;
}

export interface PlatformStoryContext {
  mentions: StoryMentionContext[];
  keyDetailTemplates: Record<MentionType, KeyDetailTemplate[]>;
  scenes: StorySceneContext[];
  notes: StoryNoteContext[];
}

/** @deprecated Use PlatformActionResponse for platform translation output */
export interface PlannerAiResponse {
  mentions: {
    shortId: string;
    name: string;
    type: MentionType;
    description?: string;
    context: {
      category:
        | "psychology"
        | "history"
        | "relationships"
        | "physicality"
        | "arc"
        | "significance"
        | "lore";
      value: string;
    }[];
  }[];
  plotPoints: {
    text: string;
    mentions: string[];
  }[];
}
