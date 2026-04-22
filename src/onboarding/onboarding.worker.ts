import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import { ProviderService } from '../ai/provider.service'
import { PrismaService } from '../database/prisma.service'
import { ProgressGateway } from '../gateway/progress.gateway'
import { DREAM_THREAD_GENERATE_QUEUE, ONBOARDING_GENERATE_QUEUE } from '../queues/queue.constants'

interface OnboardingAnswers {
  setting: string;
  era: string;
  magicOrTech: string;
  characters: string;
  relationships: string;
  conflict: string;
  plotBeats: string;
}

interface OnboardingJob {
  storyId: string;
  userId: string;
  answers: OnboardingAnswers;
}

interface GeneratedOnboarding {
  characters: Array<{
    name: string;
    role?: string;
    objective?: string;
    superObjective?: string;
    description?: string;
  }>;
  locations: Array<{
    name: string;
    role?: string;
    description?: string;
    atmosphere?: string;
  }>;
  worldCanon: {
    era?: string;
    setting?: string;
    magic?: string;
    socialStructure?: string;
    tone?: string;
    custom?: Record<string, string>;
  };
  plotBeats: Array<{
    title: string;
    note?: string;
  }>;
}

@Processor(ONBOARDING_GENERATE_QUEUE)
export class OnboardingWorker extends WorkerHost {
  private readonly logger = new Logger(OnboardingWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: ProviderService,
    private readonly gateway: ProgressGateway,
    @InjectQueue(DREAM_THREAD_GENERATE_QUEUE)
    private readonly dreamThreadQueue: Queue,
  ) {
    super();
  }

  private parsePayload(raw: string): GeneratedOnboarding {
    const trimmed = raw.trim();
    const withoutFence = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '');
    return JSON.parse(withoutFence) as GeneratedOnboarding;
  }

  private initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'NA';
  }

  private colorFor(index: number): string {
    const palette = ['pink', 'teal', 'amber', 'blue', 'orange', 'green'];
    return palette[index % palette.length];
  }

  async process(job: Job<OnboardingJob>): Promise<void> {
    const { storyId, userId, answers } = job.data;

    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story || story.userId !== userId) {
      this.logger.warn(`Skipping onboarding for inaccessible story ${storyId}`);
      return;
    }

    const userPrompt = `You are a story development assistant.

## Writer's answers
Setting: ${answers.setting}
Era: ${answers.era}
Magic / technology: ${answers.magicOrTech}
Characters: ${answers.characters}
Relationships: ${answers.relationships}
Central conflict: ${answers.conflict}
Known plot beats: ${answers.plotBeats}

Return ONLY a JSON object. No preamble, no markdown fences.

{
  "characters": [{ "name", "role", "objective", "superObjective", "description" }],
  "locations":  [{ "name", "role", "description", "atmosphere" }],
  "worldCanon": { "era", "setting", "magic", "socialStructure", "tone", "custom": {} },
  "plotBeats":  [{ "title", "note" }]
}`;

    const systemPrompt = 'Return strict valid JSON only.';

    try {
      const raw = await this.provider.complete(userPrompt, systemPrompt);
      const payload = this.parsePayload(raw);

      const maxOrder = await this.prisma.block.aggregate({
        where: { storyId },
        _max: { order: true },
      });

      const lastVisiblePassage = await this.prisma.passage.findFirst({
        where: { storyId, visible: true },
        orderBy: { order: 'desc' },
        select: { id: true },
      });

      let nextOrder = (maxOrder._max.order ?? 0) + 1;

      await this.prisma.$transaction(async (tx) => {
        if (payload.characters?.length) {
          await tx.character.createMany({
            data: payload.characters
              .filter((item) => typeof item.name === 'string' && item.name.trim().length > 0)
              .map((item, index) => ({
                storyId,
                userId,
                name: item.name,
                initials: this.initials(item.name),
                color: this.colorFor(index),
                seedPrompt: item.description ?? item.role ?? '',
                superObjective: item.superObjective ?? item.objective ?? '',
              })),
          });
        }

        if (payload.locations?.length) {
          await tx.location.createMany({
            data: payload.locations
              .filter((item) => typeof item.name === 'string' && item.name.trim().length > 0)
              .map((item, index) => ({
                storyId,
                userId,
                name: item.name,
                color: this.colorFor(index + 2),
                description: item.description ?? item.atmosphere ?? item.role ?? '',
              })),
          });
        }

        await tx.worldCanon.upsert({
          where: { storyId },
          update: {
            rules: {
              era: payload.worldCanon?.era ?? answers.era,
              setting: payload.worldCanon?.setting ?? answers.setting,
              magic: payload.worldCanon?.magic ?? answers.magicOrTech,
              socialStructure: payload.worldCanon?.socialStructure ?? '',
              tone: payload.worldCanon?.tone ?? '',
              custom: payload.worldCanon?.custom ?? {},
            } as object,
          },
          create: {
            storyId,
            rules: {
              era: payload.worldCanon?.era ?? answers.era,
              setting: payload.worldCanon?.setting ?? answers.setting,
              magic: payload.worldCanon?.magic ?? answers.magicOrTech,
              socialStructure: payload.worldCanon?.socialStructure ?? '',
              tone: payload.worldCanon?.tone ?? '',
              custom: payload.worldCanon?.custom ?? {},
            } as object,
          },
        });

        for (const beat of payload.plotBeats ?? []) {
          if (!beat?.title) continue;

          const block = await tx.block.create({
            data: {
              storyId,
              passageId: lastVisiblePassage?.id,
              type: 'heading2',
              status: 'skeleton',
              content: beat.title,
              contentJSON: {
                type: 'doc',
                content: [
                  {
                    type: 'heading',
                    attrs: { level: 2 },
                    content: [{ type: 'text', text: beat.title }],
                  },
                ],
              },
              order: nextOrder,
            },
          });
          nextOrder += 1;

          await tx.storyboardNote.create({
            data: {
              storyId,
              passageId: block.id,
              body: beat.note ?? '',
            },
          });
        }

        await tx.story.update({
          where: { id: storyId },
          data: { onboardingComplete: true },
        });
      });

      await this.dreamThreadQueue.add(DREAM_THREAD_GENERATE_QUEUE, { storyId });
      this.gateway.emitOnboardingComplete(storyId);
    } catch (error) {
      this.logger.error(`Failed onboarding generation for story ${storyId}: ${String(error)}`);
      throw error;
    }
  }
}
