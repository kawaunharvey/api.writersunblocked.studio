import type { PlatformActionResponse } from "@/modules/platform/platform.types";

export type {
  PlatformAction,
  PlatformActionField,
  PlatformActionItem,
  PlatformActionResponse,
  PlatformExtractionResponse,
  PlannerAiResponse,
} from "@/modules/platform/platform.types";

export type EmitOnboardToPlatformData = {
  wordCount: number;
  thresholdWordCount: number;
  thresholdReached: boolean;
  answeredCount: number;
  thresholdMet: boolean;
  translation: PlatformActionResponse | null;
};

export interface InterrogateQuestionStatus {
  question: string;
  answered: boolean;
  evidence?: string;
}

export type EmitInterrogateCompleteSuccess = {
  wordCount: number;
  thresholdReached: boolean;
  status: InterrogateQuestionStatus[];
};
