import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import Redis from 'ioredis'
import { createHash } from 'node:crypto'
import { ProviderService } from '../ai/provider.service'
import { SpConstructorService } from '../ai/sp-constructor.service'
import { AppConfigService } from '../common/config/app-config.service'
import type { CandidateDirection, SurfacedDirection } from '../common/types/simulation.types'
import { PrismaService } from '../database/prisma.service'
import { EVENT_GROUP, EVENT_TYPE } from '../events/event.constants'
import { EventsService } from '../events/events.service'
import { ThreadsService } from '../threads/threads.service'
import { MomentumService } from './momentum.service'

@Injectable()
export class SimulationService {
  private readonly redis: Redis;
  private readonly logger = new Logger(SimulationService.name);

  private buildCacheKey(input: {
    storyId: string;
    highlightBlockId: string;
    question: string;
    includeDreamThreads?: boolean;
  }): string {
    const normalizedQuestion = input.question.trim().replace(/\s+/g, ' ');
    const questionHash = createHash('sha256')
      .update(normalizedQuestion)
      .digest('hex')
      .slice(0, 16);

    const dreamThreadsFlag = input.includeDreamThreads ? 'dt1' : 'dt0';
    return `simulate:${input.storyId}:${input.highlightBlockId}:${questionHash}:${dreamThreadsFlag}`;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly spConstructor: SpConstructorService,
    private readonly provider: ProviderService,
    private readonly threadsService: ThreadsService,
    private readonly momentumService: MomentumService,
    private readonly events: EventsService,
  ) {
    this.redis = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });
  }

  async simulate(input: {
    storyId: string;
    userId: string;
    highlightBlockId: string;
    question: string;
    includeDreamThreads?: boolean;
    blockWindowSize?: number;
  }): Promise<{
    simulationId: string;
    directions: SurfacedDirection[];
    pecDiscardedCount: number;
    sensoryPresent: unknown;
  }> {
    const windowSize = input.blockWindowSize ?? this.config.blockWindowSize;
    const cacheKey = this.buildCacheKey(input);

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for ${cacheKey}`);
      this.events.record({
        eventType: EVENT_TYPE.SIMULATION_RUN_CACHE_HIT,
        eventGroup: EVENT_GROUP.SIMULATION,
        source: SimulationService.name,
        status: 'skipped',
        userId: input.userId,
        storyId: input.storyId,
        metadata: {
          highlightBlockId: input.highlightBlockId,
          cacheKey,
          questionLength: input.question.length,
        },
      });
      return JSON.parse(cached);
    }

    this.events.record({
      eventType: EVENT_TYPE.SIMULATION_RUN_STARTED,
      eventGroup: EVENT_GROUP.SIMULATION,
      source: SimulationService.name,
      status: 'success',
      userId: input.userId,
      storyId: input.storyId,
      metadata: {
        highlightBlockId: input.highlightBlockId,
        cacheKey,
        questionLength: input.question.length,
      },
    });

    const startMs = Date.now();

    try {
    // Verify ownership
    const story = await this.prisma.story.findUnique({ where: { id: input.storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== input.userId) throw new NotFoundException('Story not found');

    // Step 1 — Block range resolver
    const highlightBlock = await this.prisma.block.findUnique({
      where: { id: input.highlightBlockId },
    });
    if (!highlightBlock) throw new NotFoundException('Block not found');

    const allBlocks = await this.prisma.block.findMany({
      where: { storyId: input.storyId },
      orderBy: { order: 'asc' },
      select: { id: true, content: true, order: true },
    });

    const idx = allBlocks.findIndex((b) => b.id === input.highlightBlockId);
    const priorBlocks = allBlocks.slice(Math.max(0, idx - windowSize), idx);
    const forwardBlocks = allBlocks.slice(idx + 1, idx + 1 + windowSize);

    // Step 2 — Sensory present construction
    const allCharacters = await this.prisma.character.findMany({
      where: { storyId: input.storyId },
      orderBy: { mentionCount: 'desc' },
    });

    // Find entities recently active in the block range
    const rangeBlockIds = [
      ...priorBlocks.map((b) => b.id),
      input.highlightBlockId,
      ...forwardBlocks.map((b) => b.id),
    ];
    const rangeThreads = await this.prisma.thread.findMany({
      where: { blockId: { in: rangeBlockIds } },
    });
    const activeEntityIds = [...new Set(rangeThreads.map((t) => t.entityId))];

    const entityInfos = allCharacters
      .filter((c) => activeEntityIds.includes(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        recentBlockOrder: Math.max(
          ...rangeThreads.filter((t) => t.entityId === c.id).map((t) => t.blockOrder),
        ),
      }));

    const sensoryPresent = await this.spConstructor.build(
      input.question,
      { id: highlightBlock.id, content: highlightBlock.content, order: highlightBlock.order },
      priorBlocks,
      forwardBlocks,
      entityInfos,
    );

    // Step 3 — Thread fetch with weights
    const focalEntityId = typeof sensoryPresent.focalEntityId === 'string'
      ? sensoryPresent.focalEntityId
      : null;
    const scopedEntities = sensoryPresent.entitiesPresent.filter(
      (e): e is { entityId: string; entityName: string; weightMultiplier: number } =>
        typeof e.entityId === 'string' && e.entityId.trim().length > 0,
    );
    const scopedEntityIds = [...new Set(scopedEntities.map((e) => e.entityId))];
    const weightMap = new Map(
      scopedEntities.map((e) => [e.entityId, e.weightMultiplier]),
    );

    const allEntities = [
      ...allCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        superObjective: c.superObjective,
        coreFear: c.coreFear,
        type: 'character' as const,
      })),
    ];

    const scopedEntityThreads =
      scopedEntityIds.length > 0
        ? await this.threadsService.findByEntityIds(input.storyId, scopedEntityIds)
        : [];

    const focalEntityThreads = focalEntityId
      ? scopedEntityThreads.filter((t) => t.entityId === focalEntityId)
      : scopedEntityThreads;

    // Step 4a — Character forward: build action vectors per entity
    const entityVectors = await this.buildEntityVectors(
      allEntities.filter((e) => scopedEntityIds.includes(e.id)),
      scopedEntityThreads,
      sensoryPresent,
      weightMap,
    );

    // Step 4b — AI generates 5 candidates via trajectory collision
    const dreamThreads = input.includeDreamThreads
      ? await this.prisma.dreamThread.findMany({
          where: { storyId: input.storyId },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const dreamThreadContext = input.includeDreamThreads
      ? `\n\n## World context (Dream Threads)\n${dreamThreads.map((dt) => `[${dt.type}] ${dt.body}`).join('\n')}`
      : '';

    const questionWithWorldContext = `${input.question}${dreamThreadContext}`.trim();

    const candidates = await this.generateCandidates(
      entityVectors,
      sensoryPresent,
      focalEntityThreads,
      questionWithWorldContext,
    );

    // Step 4c — PEC validation
    const forwardBlockIds = forwardBlocks.map((b) => b.id);
    const forwardThreads =
      forwardBlockIds.length > 0
        ? await this.prisma.thread.findMany({
            where: { blockId: { in: forwardBlockIds } },
          })
        : [];

    const { passed, pecDiscardedCount } = this.validatePec(
      candidates,
      focalEntityThreads,
      forwardThreads,
      forwardBlocks.length > 0,
    );

    // Step 4d — Momentum ranking, surface top 3
    const ranked = this.rankAndSurface(passed, scopedEntityThreads);
    const top3 = ranked.slice(0, 3);

    // Persist simulation run
    const run = await this.prisma.simulationRun.create({
      data: {
        storyId: input.storyId,
        userId: input.userId,
        highlightBlockId: input.highlightBlockId,
        question: input.question,
        focalEntityId,
        blockRangeIds: rangeBlockIds,
        sensoryPresent: sensoryPresent as unknown as object,
        candidates: candidates as unknown as object[],
        surfaced: top3.map((d) => d.id),
        dreamThreadIds: dreamThreads.map((thread) => thread.id),
      },
    });

    const result = {
      simulationId: run.id,
      directions: top3,
      pecDiscardedCount,
      sensoryPresent,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 600);

    this.events.record({
      eventType: EVENT_TYPE.SIMULATION_RUN_COMPLETED,
      eventGroup: EVENT_GROUP.SIMULATION,
      source: SimulationService.name,
      status: 'success',
      durationMs: Date.now() - startMs,
      userId: input.userId,
      storyId: input.storyId,
      metadata: {
        simulationId: run.id,
        highlightBlockId: input.highlightBlockId,
        cacheKey,
        directionsCount: top3.length,
        pecDiscardedCount,
      },
    });

    return result;
    } catch (err) {
      this.events.record({
        eventType: EVENT_TYPE.SIMULATION_RUN_FAILED,
        eventGroup: EVENT_GROUP.SIMULATION,
        source: SimulationService.name,
        status: 'error',
        durationMs: Date.now() - startMs,
        userId: input.userId,
        storyId: input.storyId,
        metadata: {
          highlightBlockId: input.highlightBlockId,
          cacheKey,
          error: String(err),
        },
      });
      throw err;
    }
  }

  private async buildEntityVectors(
    entities: Array<{ id: string; name: string; superObjective: string; coreFear: string; type: 'character' }>,
    threads: Awaited<ReturnType<ThreadsService['findByEntityIds']>>,
    sensoryPresent: Awaited<ReturnType<SpConstructorService['build']>>,
    weightMap: Map<string, number>,
  ): Promise<string> {
    const entitySummaries = entities.map((e) => {
      const entityThreads = threads.filter((t) => t.entityId === e.id);
      const threadHistory = entityThreads
        .slice(-5)
        .map((t) => `[order ${t.blockOrder}] ${t.observation} (${t.superObjAlign ?? 'neutral'})`)
        .join(' | ');
      const weight = weightMap.get(e.id) ?? 0.4;
      return `${e.name} (weight:${weight}): superObjective="${e.superObjective}" coreFear="${e.coreFear}" history="${threadHistory}"`;
    });
    return entitySummaries.join('\n');
  }

  private async generateCandidates(
    entityVectors: string,
    sensoryPresent: Awaited<ReturnType<SpConstructorService['build']>>,
    focalThreads: Awaited<ReturnType<ThreadsService['findByEntityIds']>>,
    question: string,
  ): Promise<CandidateDirection[]> {
    const systemPrompt = `You are a narrative trajectory engine. Generate exactly 5 story direction candidates.
Each must be one of these types: Collision, Revelation, Fracture, Escalation, Quiet.
Return ONLY a JSON array of objects, each with:
- id: unique string (generate a random id)
- type: the direction type
- title: string (5-10 words)
- text: string (2-4 sentence narrative direction starting with what happens, not who)
- drives: string[] (2-3 character IDs whose arcs this direction advances)
No markdown, no explanation.`;

    const recentHistory = focalThreads
      .slice(-8)
      .map((t) => `${t.observation} (${t.superObjAlign ?? 'neutral'})`)
      .join(' → ');

    const userPrompt = `Writer's question: ${question || '(surface what matters most)'}

Attended moment: ${sensoryPresent.attendedMoment}
Active tensions: ${sensoryPresent.activeTensions.join('; ')}
${sensoryPresent.forwardConstraint ? `Forward constraint: ${sensoryPresent.forwardConstraint}` : ''}

Entity action vectors:
${entityVectors}

Focal entity thread history (most recent):
${recentHistory || '(no history yet)'}

Generate 5 candidates: one each of Collision, Revelation, Fracture, Escalation, Quiet.`;

    try {
      const raw = await this.provider.complete(userPrompt, systemPrompt);
      return JSON.parse(raw) as CandidateDirection[];
    } catch (err) {
      this.logger.error(`Candidate generation failed: ${err}`);
      return [];
    }
  }

  private validatePec(
    candidates: CandidateDirection[],
    focalThreads: Awaited<ReturnType<ThreadsService['findByEntityIds']>>,
    forwardThreads: Awaited<ReturnType<ThreadsService['findByEntityIds']>>,
    hasForwardBlocks: boolean,
  ): { passed: (CandidateDirection & { pecNote: string })[]; pecDiscardedCount: number } {
    let discarded = 0;
    const passed: (CandidateDirection & { pecNote: string })[] = [];

    for (const candidate of candidates) {
      let pecNote = '';

      // Hard fail: forward block conflict check (only when forward blocks exist)
      if (hasForwardBlocks && forwardThreads.length > 0) {
        const conflictsForward = forwardThreads.some((t) => {
          // Simple heuristic: if a forward thread observes "contradicts" and involves same entity
          return t.superObjAlign === 'contradicts' && candidate.drives.includes(t.entityId);
        });
        if (conflictsForward) {
          discarded++;
          continue;
        }
      }

      // Soft fail checks — logged as pecNote
      const recentContradictions = focalThreads.filter(
        (t) => t.superObjAlign === 'contradicts',
      ).length;

      if (candidate.type === 'Quiet' && recentContradictions > 2) {
        pecNote = `Soft flag: ${recentContradictions} recent contradictions suggest tension, not quiet`;
      }

      passed.push({ ...candidate, pecNote });
    }

    return { passed, pecDiscardedCount: discarded };
  }

  private rankAndSurface(
    candidates: (CandidateDirection & { pecNote: string })[],
    allThreads: Awaited<ReturnType<ThreadsService['findByEntityIds']>>,
  ): SurfacedDirection[] {
    const unresolvedCount = allThreads.filter(
      (t) => t.superObjAlign === 'diverging' || t.superObjAlign === 'contradicts',
    ).length;

    return candidates
      .map((c) => {
        const tensionPotential = c.type === 'Collision' ? 90 :
          c.type === 'Fracture' ? 80 :
          c.type === 'Escalation' ? 70 :
          c.type === 'Revelation' ? 60 : 30;

        const arcProgression = c.drives.length * 25;

        const momentumScore = this.momentumService.score({
          tensionPotential,
          unresolvedThreadCount: unresolvedCount,
          arcProgression,
        });

        return {
          id: c.id,
          type: c.type,
          title: c.title,
          text: c.text,
          drives: c.drives,
          momentumScore,
          pecNote: c.pecNote,
        };
      })
      .sort((a, b) => b.momentumScore - a.momentumScore);
  }

  async rateSimulation(input: { simulationId: string; action: string }) {
    return this.prisma.simulationRun.update({
      where: { id: input.simulationId },
      data: { userAction: input.action },
    });
  }

  async promoteSimulation(input: { simulationId: string; tier: string }) {
    return this.prisma.simulationRun.update({
      where: { id: input.simulationId },
      data: { promotedTier: input.tier },
    });
  }

  async getHistory(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story || story.userId !== userId) throw new NotFoundException('Story not found');
    return this.prisma.simulationRun.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invalidateCacheForStory(storyId: string) {
    // Pattern delete — find all keys matching simulate:{storyId}:*
    const keys = await this.redis.keys(`simulate:${storyId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
