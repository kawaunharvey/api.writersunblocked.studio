import { PrismaService } from '@/database/prisma.service';
import { Injectable } from '@nestjs/common';
import type { Prisma, Thread } from '@prisma/client';
import {
  MIN_THREAD_CONFIDENCE,
  type MergeUpsertsResult,
  type ThreadResponse,
  type ThreadUpsert,
} from '../story-intelligence.types';

@Injectable()
export class ThreadService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(thread: Thread): ThreadResponse {
    return {
      id: thread.id,
      storyId: thread.storyId,
      layer: thread.layer,
      status: thread.status,
      canonStatus: thread.canonStatus,
      confidence: thread.confidence,
      summary: thread.summary,
      body: thread.body as Record<string, unknown>,
      pecFlags: thread.pecFlags,
      sourceInputId: thread.sourceInputId,
      mentionIds: thread.mentionIds,
      sceneIds: thread.sceneIds,
      relatedThreadIds: thread.relatedThreadIds,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
    };
  }

  async listThreads(
    storyId: string,
    filters?: {
      layer?: string;
      canonStatus?: string;
      sceneId?: string;
      status?: string;
    },
  ): Promise<ThreadResponse[]> {
    const where: Prisma.ThreadWhereInput = { storyId };

    if (filters?.layer) {
      where.layer = filters.layer as Prisma.EnumThreadLayerFilter['equals'];
    }
    if (filters?.canonStatus) {
      where.canonStatus =
        filters.canonStatus as Prisma.EnumCanonStatusFilter['equals'];
    }
    if (filters?.status) {
      where.status = filters.status as Prisma.EnumThreadStatusFilter['equals'];
    }
    if (filters?.sceneId) {
      where.sceneIds = { has: filters.sceneId };
    }

    const threads = await this.prisma.thread.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
    });

    return threads.map((thread) => this.toResponse(thread));
  }

  async mergeUpserts(
    storyId: string,
    sourceInputId: string,
    upserts: ThreadUpsert[],
  ): Promise<MergeUpsertsResult> {
    let threadsCreated = 0;
    let threadsUpdated = 0;
    const affectedSceneIds = new Set<string>();
    const affectedMentionIds = new Set<string>();

    for (const upsert of upserts) {
      if (upsert.confidence < MIN_THREAD_CONFIDENCE) {
        continue;
      }

      upsert.links.sceneIds?.forEach((id) => affectedSceneIds.add(id));
      upsert.links.mentionIds?.forEach((id) => affectedMentionIds.add(id));

      if (upsert.op === 'resolve') {
        const existing = await this.findMatchingThread(storyId, upsert);
        if (existing) {
          await this.prisma.thread.update({
            where: { id: existing.id },
            data: { status: 'resolved', updatedAt: new Date() },
          });
          threadsUpdated += 1;
        }
        continue;
      }

      const existing = await this.findMatchingThread(storyId, upsert);

      if (existing) {
        await this.prisma.thread.update({
          where: { id: existing.id },
          data: {
            summary: upsert.summary,
            body: upsert.body as Prisma.InputJsonValue,
            confidence: upsert.confidence,
            pecFlags: upsert.pecFlags ?? [],
            status: upsert.op === 'update' ? existing.status : existing.status,
            mentionIds: this.mergeIds(existing.mentionIds, upsert.links.mentionIds),
            sceneIds: this.mergeIds(existing.sceneIds, upsert.links.sceneIds),
            relatedThreadIds: this.mergeIds(
              existing.relatedThreadIds,
              upsert.links.relatedThreadIds,
            ),
            sourceInputId,
          },
        });
        threadsUpdated += 1;
      } else {
        await this.prisma.thread.create({
          data: {
            storyId,
            layer: upsert.layer,
            status: 'open',
            canonStatus: upsert.canonStatus,
            confidence: upsert.confidence,
            summary: upsert.summary,
            body: upsert.body as Prisma.InputJsonValue,
            pecFlags: upsert.pecFlags ?? [],
            sourceInputId,
            mentionIds: upsert.links.mentionIds ?? [],
            sceneIds: upsert.links.sceneIds ?? [],
            relatedThreadIds: upsert.links.relatedThreadIds ?? [],
          },
        });
        threadsCreated += 1;
      }
    }

    await this.refreshDenormalizedCounts(storyId, affectedSceneIds, affectedMentionIds);

    return { threadsCreated, threadsUpdated };
  }

  private mergeIds(existing: string[], incoming?: string[]): string[] {
    if (!incoming?.length) {
      return existing;
    }
    return [...new Set([...existing, ...incoming])];
  }

  private async findMatchingThread(storyId: string, upsert: ThreadUpsert) {
    const mentionId = upsert.links.mentionIds?.[0];

    if (mentionId) {
      return this.prisma.thread.findFirst({
        where: {
          storyId,
          layer: upsert.layer,
          canonStatus: upsert.canonStatus,
          mentionIds: { has: mentionId },
          status: { not: 'resolved' },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    return this.prisma.thread.findFirst({
      where: {
        storyId,
        layer: upsert.layer,
        canonStatus: upsert.canonStatus,
        summary: upsert.summary,
        status: { not: 'resolved' },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async refreshDenormalizedCounts(
    storyId: string,
    sceneIds: Set<string>,
    mentionIds: Set<string>,
  ) {
    for (const sceneId of sceneIds) {
      const count = await this.prisma.thread.count({
        where: {
          storyId,
          sceneIds: { has: sceneId },
          status: { not: 'resolved' },
        },
      });

      await this.prisma.scene.update({
        where: { id: sceneId },
        data: { threadCount: count, lastAnalyzedAt: new Date() },
      });
    }

    for (const mentionId of mentionIds) {
      const threads = await this.prisma.thread.findMany({
        where: {
          storyId,
          mentionIds: { has: mentionId },
          status: { not: 'resolved' },
        },
        select: { id: true },
      });

      await this.prisma.mention.update({
        where: { id: mentionId },
        data: { threadIds: threads.map((thread) => thread.id) },
      });
    }
  }
}
