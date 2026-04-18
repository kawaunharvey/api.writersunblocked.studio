import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../database/prisma.service';
import { AppConfigService } from '../common/config/app-config.service';
import { PassagesService } from '../passages/passages.service';

@Injectable()
export class BlocksService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly passagesService: PassagesService,
  ) {
    this.redis = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });
  }

  private sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  private async invalidateSimulationCache(storyId: string) {
    const keys = await this.redis.keys(`simulate:${storyId}:*`);
    if (keys.length > 0) await this.redis.del(...keys);
  }

  private async assertOwnership(blockId: string, userId: string) {
    const block = await this.prisma.block.findUnique({
      where: { id: blockId },
      include: { story: { select: { userId: true, id: true } } },
    });
    if (!block) throw new NotFoundException('Block not found');
    if (block.story.userId !== userId) throw new ForbiddenException();
    return block;
  }

  async create(
    storyId: string,
    userId: string,
    data: {
      type: string;
      content: string;
      contentJSON: Record<string, unknown>;
      order: number;
      passageId?: string;
    },
  ) {
    // Verify story ownership
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();

    if (data.passageId) {
      const passage = await this.prisma.passage.findUnique({
        where: { id: data.passageId },
        include: { story: { select: { userId: true, id: true } } },
      });
      if (!passage || passage.storyId !== storyId) {
        throw new NotFoundException('Passage not found');
      }
      if (passage.story.userId !== userId) {
        throw new ForbiddenException();
      }
    } else {
      const lastVisiblePassage = await this.prisma.passage.findFirst({
        where: { storyId, visible: true },
        orderBy: { order: 'desc' },
        select: { id: true },
      });

      if (lastVisiblePassage) {
        data.passageId = lastVisiblePassage.id;
      }
    }

    const hash = this.sha256(data.content);
    const block = await this.prisma.block.create({
      data: { storyId, ...data, contentJSON: data.contentJSON as object, hash, status: 'pending' },
    });

    if (block.passageId) {
      await this.passagesService.recomputeMetadata(block.passageId);
    }

    return { ...block, changed: true };
  }

  async update(
    blockId: string,
    userId: string,
    data: {
      type?: string;
      content?: string;
      contentJSON?: Record<string, unknown>;
      order?: number;
      passageId?: string;
    },
  ) {
    const block = await this.assertOwnership(blockId, userId);

    if (data.passageId) {
      const passage = await this.prisma.passage.findUnique({
        where: { id: data.passageId },
        include: { story: { select: { userId: true, id: true } } },
      });
      if (!passage || passage.storyId !== block.storyId) {
        throw new NotFoundException('Passage not found');
      }
      if (passage.story.userId !== userId) {
        throw new ForbiddenException();
      }
    }

    const hasNonContentChange =
      data.type !== undefined || data.order !== undefined || data.passageId !== undefined;

    if (data.content !== undefined) {
      const newHash = this.sha256(data.content);
      if (newHash === block.hash && !hasNonContentChange && data.contentJSON === undefined) {
        // Content unchanged — skip re-analysis
        return { id: block.id, status: block.status, changed: false };
      }

      const nextStatus = newHash === block.hash ? block.status : 'pending';
      const updated = await this.prisma.block.update({
        where: { id: blockId },
        data: {
          ...data,
          contentJSON: data.contentJSON as object | undefined,
          hash: newHash,
          status: nextStatus,
        },
      });

      if (newHash !== block.hash) {
        // Invalidate simulation cache for this story on content change
        await this.invalidateSimulationCache(block.storyId);
      }

      const passageIds = new Set<string>();
      if (block.passageId) passageIds.add(block.passageId);
      if (updated.passageId) passageIds.add(updated.passageId);
      for (const passageId of passageIds) {
        await this.passagesService.recomputeMetadata(passageId);
      }

      return { ...updated, changed: true };
    }

    // Non-content update (e.g. order change)
    const updated = await this.prisma.block.update({
      where: { id: blockId },
      data: data as any,
    });

    const passageIds = new Set<string>();
    if (block.passageId) passageIds.add(block.passageId);
    if (updated.passageId) passageIds.add(updated.passageId);
    for (const passageId of passageIds) {
      await this.passagesService.recomputeMetadata(passageId);
    }

    return { ...updated, changed: false };
  }

  async delete(blockId: string, userId: string) {
    const block = await this.assertOwnership(blockId, userId);
    const deleted = await this.prisma.block.delete({ where: { id: blockId } });
    if (block.passageId) {
      await this.passagesService.recomputeMetadata(block.passageId);
    }
    return deleted;
  }

  async enqueueAnalysis(blockId: string, userId: string) {
    const block = await this.assertOwnership(blockId, userId);

    if (block.status === 'queued' || block.status === 'analyzing') {
      return { ...block, shouldQueue: false };
    }

    const updated = await this.prisma.block.update({
      where: { id: blockId },
      data: { status: 'queued' },
    });

    return { ...updated, shouldQueue: true };
  }
}
