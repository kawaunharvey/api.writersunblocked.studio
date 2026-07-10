import { PrismaService } from '@/database/prisma.service';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RecordStoryInputParams } from '../story-intelligence.types';
import { hashContent } from '../utils/content-hash';

@Injectable()
export class StoryInputService {
  constructor(private readonly prisma: PrismaService) {}

  async recordInput(params: RecordStoryInputParams) {
    const contentHash = hashContent(params.plainText ?? '');

    return this.prisma.storyInput.create({
      data: {
        storyId: params.storyId,
        userId: params.userId,
        source: params.source,
        canonStatus: params.canonStatus,
        plainText: params.plainText,
        contentHash,
        sceneId: params.sceneId,
        sceneVersionId: params.sceneVersionId,
        mentionId: params.mentionId,
        noteId: params.noteId,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findById(inputId: string) {
    return this.prisma.storyInput.findUnique({ where: { id: inputId } });
  }

  async hasRecentCompletedRun(
    storyId: string,
    sceneId: string | undefined,
    contentHash: string,
    jobType: string,
  ): Promise<boolean> {
    const recentInputs = await this.prisma.storyInput.findMany({
      where: {
        storyId,
        contentHash,
        ...(sceneId ? { sceneId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true },
    });

    if (recentInputs.length === 0) {
      return false;
    }

    const completedRun = await this.prisma.intelligenceRun.findFirst({
      where: {
        inputId: { in: recentInputs.map((input) => input.id) },
        jobType,
        status: 'completed',
      },
    });

    return Boolean(completedRun);
  }
}
