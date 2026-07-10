import { PrismaService } from '@/database/prisma.service';
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  IntelligenceRunResponse,
  StoryIntelligenceContext,
} from '../story-intelligence.types';

@Injectable()
export class IntelligenceContextService {
  constructor(private readonly prisma: PrismaService) {}

  async buildContext(
    storyId: string,
    sceneId?: string,
  ): Promise<StoryIntelligenceContext> {
    const [threads, mentions] = await Promise.all([
      this.prisma.thread.findMany({
        where: {
          storyId,
          ...(sceneId ? { sceneIds: { has: sceneId } } : {}),
        },
        orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
        take: 40,
      }),
      this.prisma.mention.findMany({
        where: { storyId },
        select: { id: true, name: true, mentionType: true },
        orderBy: [{ mentionCount: 'desc' }],
        take: 30,
      }),
    ]);

    const canonThreads = threads.filter((thread) => thread.canonStatus === 'canon');
    const intentThreads = threads.filter((thread) => thread.canonStatus === 'intent');

    const characterNotes = canonThreads
      .filter((thread) => thread.layer === 'character_arc')
      .slice(0, 8)
      .map((thread) => {
        const body = thread.body as Record<string, unknown>;
        const name =
          typeof body.characterName === 'string'
            ? body.characterName
            : thread.summary.split(':')[0]?.trim() ?? 'Character';

        return {
          name,
          summary: thread.summary,
          body,
        };
      });

    const worldRules = canonThreads
      .filter((thread) => thread.layer === 'world_rule')
      .slice(0, 6)
      .map((thread) => thread.summary);

    for (const thread of canonThreads.filter((t) => t.layer === 'character_arc')) {
      const body = thread.body as Record<string, unknown>;
      if (typeof body.languageNotes === 'string' && body.languageNotes.trim()) {
        worldRules.push(body.languageNotes.trim());
      }
    }

    const toneNotes = canonThreads
      .filter((thread) => thread.layer === 'tone')
      .slice(0, 6)
      .map((thread) => thread.summary);

    for (const thread of canonThreads.filter((t) => t.layer === 'character_arc')) {
      const body = thread.body as Record<string, unknown>;
      if (typeof body.voiceToneNotes === 'string' && body.voiceToneNotes.trim()) {
        toneNotes.push(body.voiceToneNotes.trim());
      }
    }

    const version = createHash('sha256')
      .update(
        threads.map((thread) => `${thread.id}:${thread.updatedAt.toISOString()}`).join('|'),
      )
      .digest('hex')
      .slice(0, 16);

    return {
      version,
      canon: {
        characterNotes,
        worldRules: [...new Set(worldRules)].slice(0, 10),
        toneNotes: [...new Set(toneNotes)].slice(0, 10),
      },
      intent: {
        openThreads: intentThreads
          .filter((thread) => thread.status === 'open' || thread.status === 'advanced')
          .slice(0, 10)
          .map((thread) => ({ layer: thread.layer, summary: thread.summary })),
        conflicts: threads
          .filter((thread) => thread.status === 'contradicted')
          .slice(0, 6)
          .map((thread) => ({ summary: thread.summary, pecFlags: thread.pecFlags })),
      },
      mentions: mentions.map((mention) => ({
        id: mention.id,
        name: mention.name,
        type: mention.mentionType,
      })),
    };
  }

  async listRuns(storyId: string, limit = 20): Promise<IntelligenceRunResponse[]> {
    const runs = await this.prisma.intelligenceRun.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return runs.map((run) => ({
      id: run.id,
      storyId: run.storyId,
      inputId: run.inputId,
      jobType: run.jobType,
      status: run.status,
      sceneId: run.sceneId,
      threadsCreated: run.threadsCreated,
      threadsUpdated: run.threadsUpdated,
      diagnostic: run.diagnostic,
      durationMs: run.durationMs,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    }));
  }
}
