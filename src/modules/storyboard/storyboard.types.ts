import type { PlatformActionResponse } from "@/modules/platform/platform.types";

export type {
  PlatformAction,
  PlatformActionField,
  PlatformActionItem,
  PlatformActionResponse,
  PlatformExtractionResponse,
  PlannerAiResponse,
} from "@/modules/platform/platform.types";

export type PlatformItemResponse = {
  id: string;
  storyId: string;
  postId: string | null;
  action: string | null;
  body: string | null;
  data: Array<{ label: string; type: string; value: string }>;
  status: string;
  appliedEntityId: string | null;
  appliedEntityType: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
};

export type EmitOnboardToPlatformData = {
  postId?: string;
  wordCount: number;
  thresholdWordCount: number;
  thresholdReached: boolean;
  answeredCount: number;
  thresholdMet: boolean;
  translation: PlatformActionResponse | null;
  items?: PlatformItemResponse[];
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
