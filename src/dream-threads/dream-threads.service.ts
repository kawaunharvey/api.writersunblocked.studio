import { Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'

interface DreamThreadInput {
  type: string;
  body: string;
  sourceEntities: string[];
}

@Injectable()
export class DreamThreadsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForStory(storyId: string) {
    return this.prisma.dreamThread.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async replaceForStory(storyId: string, threads: DreamThreadInput[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.dreamThread.deleteMany({ where: { storyId } });

      if (threads.length === 0) {
        return [];
      }

      await tx.dreamThread.createMany({
        data: threads.map((thread) => ({
          storyId,
          type: thread.type,
          body: thread.body,
          sourceEntities: thread.sourceEntities,
        })),
      });

      return tx.dreamThread.findMany({
        where: { storyId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }
}
