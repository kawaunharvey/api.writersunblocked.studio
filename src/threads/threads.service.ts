import { Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'

interface ThreadUpsertData {
  storyId: string;
  passageId?: string | null;
  entityType: 'character' | 'location';
  blockOrder: number;
  observation: string;
  interactions?: string[];
  emotionalTone?: string;
  superObjAlign?: 'aligned' | 'diverging' | 'contradicts' | null;
}

@Injectable()
export class ThreadsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeObservation(value: unknown): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return 'Observation unavailable.';
  }

  async upsert(blockId: string, entityId: string, data: ThreadUpsertData) {
    const observation = this.normalizeObservation((data as { observation?: unknown }).observation);

    return this.prisma.thread.upsert({
      where: { blockId_entityId: { blockId, entityId } },
      create: {
        blockId,
        entityId,
        storyId: data.storyId,
        passageId: data.passageId,
        entityType: data.entityType,
        blockOrder: data.blockOrder,
        observation,
        interactions: data.interactions ?? [],
        emotionalTone: data.emotionalTone,
        superObjAlign: data.superObjAlign,
      },
      update: {
        passageId: data.passageId,
        observation,
        interactions: data.interactions ?? [],
        emotionalTone: data.emotionalTone,
        superObjAlign: data.superObjAlign,
      },
    });
  }

  async findByEntity(storyId: string, entityId: string) {
    return this.prisma.thread.findMany({
      where: { storyId, entityId },
      orderBy: { blockOrder: 'asc' },
    });
  }

  async findByBlock(blockId: string) {
    return this.prisma.thread.findMany({ where: { blockId } });
  }

  async findByEntityIds(storyId: string, entityIds: string[]) {
    const sanitizedEntityIds = [...new Set(entityIds.filter((entityId) => typeof entityId === 'string' && entityId.trim().length > 0))];
    if (sanitizedEntityIds.length === 0) {
      return [];
    }

    return this.prisma.thread.findMany({
      where: { storyId, entityId: { in: sanitizedEntityIds } },
      orderBy: { blockOrder: 'asc' },
    });
  }

  async deleteByBlock(blockId: string) {
    return this.prisma.thread.deleteMany({ where: { blockId } });
  }

  async findForStory(storyId: string, entityId?: string) {
    return this.prisma.thread.findMany({
      where: { storyId, ...(entityId ? { entityId } : {}) },
      orderBy: { blockOrder: 'asc' },
    });
  }
}
