import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { DreamThreadJobsService } from '../dream-threads/dream-thread-jobs.service'
import { StoriesService } from '../stories/stories.service'

interface Alias {
  text: string;
  context?: string;
  addedAt: string;
}

@Injectable()
export class CharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storiesService: StoriesService,
    private readonly dreamThreadJobs: DreamThreadJobsService,
  ) {}

  private async assertOwnership(characterId: string, userId: string) {
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new NotFoundException('Character not found');
    if (character.userId !== userId) throw new ForbiddenException();
    return character;
  }

  async list(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();
    return this.prisma.character.findMany({
      where: { storyId },
      orderBy: { mentionCount: 'desc' },
    });
  }

  async create(
    storyId: string,
    userId: string,
    data: {
      name: string;
      initials: string;
      color: string;
      seedPrompt?: string;
      weight?: number;
      superObjective?: string;
      coreFear?: string;
    },
  ) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();
    const created = await this.prisma.character.create({
      data: { storyId, userId, ...data },
    });

    await this.storiesService.refreshReferencesForStory(storyId, userId);
    await this.dreamThreadJobs.enqueueDebounced(storyId);

    return created;
  }

  async update(characterId: string, userId: string, data: Partial<{
    name: string;
    initials: string;
    color: string;
    seedPrompt: string;
    weight: number;
    superObjective: string;
    coreFear: string;
    aliases: unknown[];
    customTags: unknown[];
  }>) {
    const character = await this.assertOwnership(characterId, userId);
    const updated = await this.prisma.character.update({ where: { id: characterId }, data: data as any });

    const needsReferenceRefresh =
      data.name !== undefined ||
      data.color !== undefined ||
      data.aliases !== undefined;

    if (needsReferenceRefresh) {
      await this.storiesService.refreshReferencesForStory(character.storyId, userId);
    }

    await this.dreamThreadJobs.enqueueDebounced(character.storyId);

    return updated;
  }

  async addAlias(characterId: string, userId: string, alias: { text: string; context?: string }) {
    const character = await this.assertOwnership(characterId, userId);
    const existingAliases = (character.aliases ?? []) as unknown as Alias[];
    const newAlias: Alias = {
      text: alias.text,
      context: alias.context,
      addedAt: new Date().toISOString(),
    };
    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: { aliases: [...existingAliases, newAlias] as any },
    });

    await this.storiesService.refreshReferencesForStory(character.storyId, userId);

    return updated;
  }

  async removeAlias(characterId: string, userId: string, aliasText: string) {
    const character = await this.assertOwnership(characterId, userId);
    const existingAliases = (character.aliases ?? []) as unknown as Alias[];
    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: { aliases: existingAliases.filter((a) => a.text !== aliasText) as any },
    });

    await this.storiesService.refreshReferencesForStory(character.storyId, userId);

    return updated;
  }

  async delete(characterId: string, userId: string) {
    const character = await this.assertOwnership(characterId, userId);
    const deleted = await this.prisma.character.delete({ where: { id: characterId } });

    await this.storiesService.refreshReferencesForStory(character.storyId, userId);

    return deleted;
  }
}
