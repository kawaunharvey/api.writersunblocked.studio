import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

interface Alias {
  text: string;
  context?: string;
  addedAt: string;
}

@Injectable()
export class CharactersService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.character.create({
      data: { storyId, userId, ...data },
    });
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
    await this.assertOwnership(characterId, userId);
    return this.prisma.character.update({ where: { id: characterId }, data: data as any });
  }

  async addAlias(characterId: string, userId: string, alias: { text: string; context?: string }) {
    const character = await this.assertOwnership(characterId, userId);
    const existingAliases = (character.aliases ?? []) as unknown as Alias[];
    const newAlias: Alias = {
      text: alias.text,
      context: alias.context,
      addedAt: new Date().toISOString(),
    };
    return this.prisma.character.update({
      where: { id: characterId },
      data: { aliases: [...existingAliases, newAlias] as any },
    });
  }

  async removeAlias(characterId: string, userId: string, aliasText: string) {
    const character = await this.assertOwnership(characterId, userId);
    const existingAliases = (character.aliases ?? []) as unknown as Alias[];
    return this.prisma.character.update({
      where: { id: characterId },
      data: { aliases: existingAliases.filter((a) => a.text !== aliasText) as any },
    });
  }

  async delete(characterId: string, userId: string) {
    await this.assertOwnership(characterId, userId);
    return this.prisma.character.delete({ where: { id: characterId } });
  }
}
