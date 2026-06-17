import type { KeyDetailTemplate, MentionType } from "./platform.types";

export const PLATFORM_MIN_WORDS = 20;

export const DEFAULT_KEY_DETAIL_TEMPLATES: Record<
  MentionType,
  KeyDetailTemplate[]
> = {
  person: [
    { label: "Full Name", type: "text" },
    { label: "Age", type: "number" },
    { label: "Species", type: "text" },
    { label: "Powers", type: "option" },
  ],
  place: [
    { label: "Name", type: "text" },
    { label: "Location", type: "text" },
    { label: "Significance", type: "text" },
  ],
  thing: [
    { label: "Name", type: "text" },
    { label: "Description", type: "text" },
    { label: "Significance", type: "text" },
  ],
};
