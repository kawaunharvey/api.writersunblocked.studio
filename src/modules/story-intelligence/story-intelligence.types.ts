import type {
  CanonStatus,
  StoryInputSource,
  ThreadLayer,
  ThreadStatus,
} from '@prisma/client';

export type { CanonStatus, StoryInputSource, ThreadLayer, ThreadStatus };

export const CHARACTER_OBSERVATION_JOB = 'character_observation';

export const MIN_THREAD_CONFIDENCE = 0.5;

export interface ThreadUpsert {
  op: 'create' | 'update' | 'resolve';
  layer: ThreadLayer;
  summary: string;
  body: Record<string, unknown>;
  links: {
    mentionIds?: string[];
    sceneIds?: string[];
    relatedThreadIds?: string[];
  };
  confidence: number;
  canonStatus: CanonStatus;
  pecFlags?: string[];
}

export interface IntelligenceJobResult {
  upserts: ThreadUpsert[];
  diagnostic?: string;
}

export interface RecordStoryInputParams {
  storyId: string;
  userId: string;
  source: StoryInputSource;
  canonStatus: CanonStatus;
  plainText?: string;
  sceneId?: string;
  sceneVersionId?: string;
  mentionId?: string;
  noteId?: string;
  metadata?: Record<string, unknown>;
}

export interface IntelligenceJobPayload {
  storyId: string;
  userId: string;
  inputId: string;
  jobType: string;
  sceneId?: string;
  contentHash: string;
}

export interface ThreadResponse {
  id: string;
  storyId: string;
  layer: ThreadLayer;
  status: ThreadStatus;
  canonStatus: CanonStatus;
  confidence: number;
  summary: string;
  body: Record<string, unknown>;
  pecFlags: string[];
  sourceInputId: string | null;
  mentionIds: string[];
  sceneIds: string[];
  relatedThreadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IntelligenceRunResponse {
  id: string;
  storyId: string;
  inputId: string;
  jobType: string;
  status: string;
  sceneId: string | null;
  threadsCreated: number;
  threadsUpdated: number;
  diagnostic: string | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface StoryIntelligenceContext {
  version: string;
  canon: {
    characterNotes: Array<{
      name: string;
      summary: string;
      body: Record<string, unknown>;
    }>;
    worldRules: string[];
    toneNotes: string[];
  };
  intent: {
    openThreads: Array<{ layer: ThreadLayer; summary: string }>;
    conflicts: Array<{ summary: string; pecFlags: string[] }>;
  };
  mentions: Array<{ id: string; name: string; type: string }>;
}

export interface MergeUpsertsResult {
  threadsCreated: number;
  threadsUpdated: number;
}

export interface AnalysisCompleteEvent {
  storyId: string;
  sceneId?: string;
  runId: string;
  threadsCreated: number;
  threadsUpdated: number;
  diagnostic?: string;
}
