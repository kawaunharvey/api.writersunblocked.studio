import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { DreamThreadJobsService } from '../dream-threads/dream-thread-jobs.service'
import { StoriesService } from '../stories/stories.service'

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storiesService: StoriesService,
    private readonly dreamThreadJobs: DreamThreadJobsService,
  ) {}

  private async assertOwnership(locationId: string, userId: string) {
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException('Location not found');
    if (location.userId !== userId) throw new ForbiddenException();
    return location;
  }

  async list(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();
    return this.prisma.location.findMany({ where: { storyId }, orderBy: { mentionCount: 'desc' } });
  }

  async create(storyId: string, userId: string, data: { name: string; color?: string; description?: string }) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();
    const created = await this.prisma.location.create({ data: { storyId, userId, ...data } });

    await this.storiesService.refreshReferencesForStory(storyId, userId);
    await this.dreamThreadJobs.enqueueDebounced(storyId);

    return created;
  }

  async update(locationId: string, userId: string, data: { name?: string; color?: string; description?: string }) {
    const location = await this.assertOwnership(locationId, userId);
    const updated = await this.prisma.location.update({ where: { id: locationId }, data });

    const needsReferenceRefresh = data.name !== undefined || data.color !== undefined;
    if (needsReferenceRefresh) {
      await this.storiesService.refreshReferencesForStory(location.storyId, userId);
    }

    await this.dreamThreadJobs.enqueueDebounced(location.storyId);

    return updated;
  }

  async delete(locationId: string, userId: string) {
    const location = await this.assertOwnership(locationId, userId);
    const deleted = await this.prisma.location.delete({ where: { id: locationId } });

    await this.storiesService.refreshReferencesForStory(location.storyId, userId);

    return deleted;
  }
}
