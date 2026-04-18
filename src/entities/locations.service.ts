import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.location.create({ data: { storyId, userId, ...data } });
  }

  async update(locationId: string, userId: string, data: { name?: string; color?: string; description?: string }) {
    await this.assertOwnership(locationId, userId);
    return this.prisma.location.update({ where: { id: locationId }, data });
  }

  async delete(locationId: string, userId: string) {
    await this.assertOwnership(locationId, userId);
    return this.prisma.location.delete({ where: { id: locationId } });
  }
}
