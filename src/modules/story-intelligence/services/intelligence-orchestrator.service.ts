import { PrismaService } from '@/database/prisma.service';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { INTELLIGENCE_QUEUE } from '../jobs/intelligence.constants';
import {
  CHARACTER_OBSERVATION_JOB,
  type IntelligenceJobPayload,
  type RecordStoryInputParams,
} from '../story-intelligence.types';
import { StoryInputService } from './story-input.service';

@Injectable()
export class IntelligenceOrchestratorService {
  private readonly logger = new Logger(IntelligenceOrchestratorService.name);

  constructor(
    @InjectQueue(INTELLIGENCE_QUEUE)
    private readonly intelligenceQueue: Queue,
    private readonly storyInputService: StoryInputService,
    private readonly prisma: PrismaService,
  ) {}

  async recordAndEnqueue(params: RecordStoryInputParams) {
    const input = await this.storyInputService.recordInput(params);

    if (!params.plainText?.trim()) {
      return { input, queued: false, reason: 'empty_text' as const };
    }

    const jobType = CHARACTER_OBSERVATION_JOB;
    const alreadyProcessed = await this.storyInputService.hasRecentCompletedRun(
      params.storyId,
      params.sceneId,
      input.contentHash,
      jobType,
    );

    if (alreadyProcessed) {
      this.logger.debug(
        `Skipping intelligence job for story=${params.storyId} scene=${params.sceneId} — content unchanged`,
      );
      return { input, queued: false, reason: 'unchanged_content' as const };
    }

    const jobId = `${params.storyId}:${params.sceneId ?? 'story'}:${input.contentHash}:${jobType}`;

    const existing = await this.intelligenceQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'delayed' || state === 'active') {
        return { input, queued: true, reason: 'already_queued' as const };
      }
      await existing.remove();
    }

    const payload: IntelligenceJobPayload = {
      storyId: params.storyId,
      userId: params.userId,
      inputId: input.id,
      jobType,
      sceneId: params.sceneId,
      contentHash: input.contentHash,
    };

    await this.intelligenceQueue.add(INTELLIGENCE_QUEUE, payload, {
      jobId,
      removeOnComplete: true,
      removeOnFail: false,
    });

    return { input, queued: true, reason: 'enqueued' as const };
  }

  async enqueueManualAnalysis(
    storyId: string,
    userId: string,
    sceneId: string,
    plainText: string,
    sceneVersionId?: string,
  ) {
    return this.recordAndEnqueue({
      storyId,
      userId,
      source: 'editor_scene',
      canonStatus: 'canon',
      plainText,
      sceneId,
      sceneVersionId,
      metadata: { manual: true },
    });
  }

  async enqueueSceneAnalysis(sceneId: string, userId: string) {
    const scene = await this.prisma.scene.findFirst({
      where: { id: sceneId, story: { userId } },
      select: { storyId: true, activeVersionId: true },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    if (!scene.activeVersionId) {
      throw new NotFoundException('Scene has no active version');
    }

    const version = await this.prisma.sceneVersion.findUnique({
      where: { id: scene.activeVersionId },
      select: { id: true, plainText: true },
    });

    return this.enqueueManualAnalysis(
      scene.storyId,
      userId,
      sceneId,
      version?.plainText ?? '',
      version?.id,
    );
  }
}
