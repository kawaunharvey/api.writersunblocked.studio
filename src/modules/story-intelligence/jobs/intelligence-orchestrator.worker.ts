import { PrismaService } from '@/database/prisma.service';
import { EVENT_GROUP, EVENT_TYPE } from '@/events/event.constants';
import { EventsService } from '@/events/events.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { StoryIntelligenceGateway } from '../story-intelligence.gateway';
import { CHARACTER_OBSERVATION_JOB, type IntelligenceJobPayload } from '../story-intelligence.types';
import { CharacterObservationHandler } from './handlers/character-observation.handler';
import { INTELLIGENCE_QUEUE } from './intelligence.constants';
import { ThreadService } from '../services/thread.service';

@Processor(INTELLIGENCE_QUEUE)
export class IntelligenceOrchestratorWorker extends WorkerHost {
  private readonly logger = new Logger(IntelligenceOrchestratorWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly threadService: ThreadService,
    private readonly characterObservationHandler: CharacterObservationHandler,
    private readonly gateway: StoryIntelligenceGateway,
    private readonly events: EventsService,
  ) {
    super();
  }

  async process(job: Job<IntelligenceJobPayload>): Promise<void> {
    const { storyId, inputId, jobType, sceneId } = job.data;
    const startMs = Date.now();

    this.logger.log(`Intelligence job ${job.id} type=${jobType} input=${inputId}`);

    const run = await this.prisma.intelligenceRun.create({
      data: {
        storyId,
        inputId,
        jobType,
        sceneId,
        status: 'running',
      },
    });

    try {
      const alreadyProcessed = await this.prisma.intelligenceRun.findFirst({
        where: {
          storyId,
          inputId,
          jobType,
          status: 'completed',
          id: { not: run.id },
        },
      });

      if (alreadyProcessed) {
        await this.completeRun(run.id, {
          status: 'skipped',
          diagnostic: 'duplicate_content',
          threadsCreated: 0,
          threadsUpdated: 0,
          durationMs: Date.now() - startMs,
          storyId,
          sceneId,
        });
        return;
      }

      let result;

      if (jobType === CHARACTER_OBSERVATION_JOB) {
        result = await this.characterObservationHandler.execute(inputId, sceneId);
      } else {
        result = { upserts: [], diagnostic: 'unknown_job_type' };
      }

      if (result.upserts.length === 0) {
        await this.completeRun(run.id, {
          status: 'skipped',
          diagnostic: result.diagnostic ?? 'no_threads',
          threadsCreated: 0,
          threadsUpdated: 0,
          durationMs: Date.now() - startMs,
          storyId,
          sceneId,
        });
        return;
      }

      const mergeResult = await this.threadService.mergeUpserts(
        storyId,
        inputId,
        result.upserts,
      );

      await this.completeRun(run.id, {
        status: 'completed',
        diagnostic: result.diagnostic,
        threadsCreated: mergeResult.threadsCreated,
        threadsUpdated: mergeResult.threadsUpdated,
        durationMs: Date.now() - startMs,
        storyId,
        sceneId,
      });

      this.events.record({
        eventType: EVENT_TYPE.INTELLIGENCE_RUN_COMPLETED,
        eventGroup: EVENT_GROUP.STORY_INTELLIGENCE,
        source: IntelligenceOrchestratorWorker.name,
        status: 'success',
        durationMs: Date.now() - startMs,
        storyId,
        metadata: {
          jobType,
          threadsCreated: mergeResult.threadsCreated,
          threadsUpdated: mergeResult.threadsUpdated,
        },
      });
    } catch (error) {
      await this.completeRun(run.id, {
        status: 'failed',
        diagnostic: String(error),
        threadsCreated: 0,
        threadsUpdated: 0,
        durationMs: Date.now() - startMs,
        storyId,
        sceneId,
      });

      this.events.record({
        eventType: EVENT_TYPE.INTELLIGENCE_RUN_FAILED,
        eventGroup: EVENT_GROUP.STORY_INTELLIGENCE,
        source: IntelligenceOrchestratorWorker.name,
        status: 'error',
        durationMs: Date.now() - startMs,
        storyId,
        metadata: { jobType, error: String(error) },
      });

      throw error;
    }
  }

  private async completeRun(
    runId: string,
    params: {
      status: 'completed' | 'skipped' | 'failed';
      diagnostic?: string;
      threadsCreated: number;
      threadsUpdated: number;
      durationMs: number;
      storyId: string;
      sceneId?: string;
    },
  ) {
    await this.prisma.intelligenceRun.update({
      where: { id: runId },
      data: {
        status: params.status,
        diagnostic: params.diagnostic,
        threadsCreated: params.threadsCreated,
        threadsUpdated: params.threadsUpdated,
        durationMs: params.durationMs,
        completedAt: new Date(),
      },
    });

    this.gateway.emitAnalysisComplete({
      storyId: params.storyId,
      sceneId: params.sceneId,
      runId,
      threadsCreated: params.threadsCreated,
      threadsUpdated: params.threadsUpdated,
      diagnostic: params.diagnostic,
    });

    if (params.threadsCreated > 0 || params.threadsUpdated > 0) {
      this.gateway.emitContextUpdated({
        storyId: params.storyId,
        sceneId: params.sceneId,
      });
    }
  }
}
