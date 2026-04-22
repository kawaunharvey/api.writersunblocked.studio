import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import Redis from 'ioredis'
import { ProviderService } from '../ai/provider.service'
import { AppConfigService } from '../common/config/app-config.service'
import { PrismaService } from '../database/prisma.service'
import { ProgressGateway } from '../gateway/progress.gateway'
import { DREAM_THREAD_GENERATE_QUEUE } from '../queues/queue.constants'
import { DreamThreadJobsService } from './dream-thread-jobs.service'

interface DreamThreadGenerateJob {
  storyId: string;
}

interface DreamThreadPayload {
  type: 'character_tension' | 'world_pressure' | 'location_potential' | 'plotline_gap';
  body: string;
  sourceEntityIds: string[];
}

@Processor(DREAM_THREAD_GENERATE_QUEUE)
export class DreamThreadGeneratorWorker extends WorkerHost {
  private readonly logger = new Logger(DreamThreadGeneratorWorker.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: ProviderService,
    private readonly gateway: ProgressGateway,
    private readonly jobs: DreamThreadJobsService,
    private readonly config: AppConfigService,
  ) {
    super();
    this.redis = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });
  }

  private parseArray(raw: string): DreamThreadPayload[] {
    const trimmed = raw.trim();
    const withoutFence = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '');
    const parsed = JSON.parse(withoutFence);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const type = typeof item?.type === 'string' ? item.type : '';
        const body = typeof item?.body === 'string' ? item.body : '';
        const sourceEntityIds = Array.isArray(item?.sourceEntityIds)
          ? item.sourceEntityIds.filter((id: unknown) => typeof id === 'string')
          : [];

        return { type, body, sourceEntityIds };
      })
      .filter((item): item is DreamThreadPayload => {
        return (
          item.body.length > 0 &&
          [
            'character_tension',
            'world_pressure',
            'location_potential',
            'plotline_gap',
          ].includes(item.type)
        );
      });
  }

  async process(job: Job<DreamThreadGenerateJob>): Promise<void> {
    const { storyId } = job.data;
    const key = this.jobs.debounceKey(storyId);

    const exists = await this.redis.exists(key);
    if (!exists) {
      await this.redis.set(key, '1', 'EX', 5);
    }

    const [characters, locations, storyboardNotes, worldCanon] = await Promise.all([
      this.prisma.character.findMany({ where: { storyId } }),
      this.prisma.location.findMany({ where: { storyId } }),
      this.prisma.storyboardNote.findMany({ where: { storyId } }),
      this.prisma.worldCanon.findUnique({ where: { storyId } }),
    ]);

    const userPrompt = `You are a narrative analyst for a story planning tool.

Given the storyboard data below, generate 4-8 Dream Threads - narrative inferences about tensions, pressures, and opportunities latent in the storyboard data that have not yet been written.

## Characters
${JSON.stringify(characters)}

## Locations
${JSON.stringify(locations)}

## Passage notes
${JSON.stringify(storyboardNotes)}

## World Canon
${JSON.stringify(worldCanon?.rules ?? {})}

Return ONLY a JSON array. No preamble, no markdown fences.
Each item: { type, body, sourceEntityIds }
type: "character_tension" | "world_pressure" | "location_potential" | "plotline_gap"
body: single sentence, max 25 words
sourceEntityIds: array of relevant character or location IDs`;

    const systemPrompt = 'Return strict valid JSON only.';

    try {
      const raw = await this.provider.complete(userPrompt, systemPrompt);
      const payload = this.parseArray(raw);

      await this.prisma.$transaction(async (tx) => {
        await tx.dreamThread.deleteMany({ where: { storyId } });

        if (payload.length > 0) {
          await tx.dreamThread.createMany({
            data: payload.map((thread) => ({
              storyId,
              type: thread.type,
              body: thread.body,
              sourceEntities: thread.sourceEntityIds,
            })),
          });
        }
      });

      this.gateway.emitDreamThreadsUpdated(storyId);
    } catch (error) {
      this.logger.error(`Failed generating dream threads for story ${storyId}: ${String(error)}`);
      throw error;
    }
  }
}
