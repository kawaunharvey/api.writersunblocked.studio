import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { DreamThreadJobsService } from '../dream-threads/dream-thread-jobs.service'

@Injectable()
export class WorldCanonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dreamThreadJobs: DreamThreadJobsService,
  ) {}

  private async assertStoryOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();
    return story;
  }

  private mergeRules(
    existingRules: Record<string, unknown>,
    patchRules: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged = {
      ...existingRules,
      ...patchRules,
    };

    const existingCustom =
      existingRules.custom && typeof existingRules.custom === 'object'
        ? (existingRules.custom as Record<string, unknown>)
        : {};

    const patchCustom =
      patchRules.custom && typeof patchRules.custom === 'object'
        ? (patchRules.custom as Record<string, unknown>)
        : {};

    if (Object.keys(existingCustom).length > 0 || Object.keys(patchCustom).length > 0) {
      merged.custom = { ...existingCustom, ...patchCustom };
    }

    return merged;
  }

  async getOrCreate(storyId: string, userId: string) {
    await this.assertStoryOwnership(storyId, userId);

    const existing = await this.prisma.worldCanon.findUnique({ where: { storyId } });
    if (existing) {
      return existing;
    }

    return this.prisma.worldCanon.create({
      data: {
        storyId,
        rules: {},
      },
    });
  }

  async patch(storyId: string, userId: string, patchRules: Record<string, unknown>) {
    await this.assertStoryOwnership(storyId, userId);

    const existing = await this.prisma.worldCanon.findUnique({ where: { storyId } });
    const mergedRules = this.mergeRules(
      (existing?.rules as Record<string, unknown> | undefined) ?? {},
      patchRules,
    );

    const canon = await this.prisma.worldCanon.upsert({
      where: { storyId },
      update: { rules: mergedRules as object },
      create: { storyId, rules: mergedRules as object },
    });

    await this.dreamThreadJobs.enqueueDebounced(storyId);

    return canon;
  }
}
