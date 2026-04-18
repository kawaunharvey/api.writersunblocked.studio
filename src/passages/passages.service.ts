import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreatePassageDto,
  CreatePassageNoteDto,
  UpdatePassageDto,
  UpdatePassageNoteDto,
} from './passages.dto';

@Injectable()
export class PassagesService {
  constructor(private readonly prisma: PrismaService) {}

  private countWords(content: string): number {
    const tokens = content.trim().match(/\S+/g);
    return tokens ? tokens.length : 0;
  }

  private extractChapterMetadata(blocks: Array<{ id: string; type: string; content: string }>) {
    const chapters = blocks
      .filter((block) => block.type === 'chapter')
      .map((block) => ({ id: block.id, title: block.content.trim() }))
      .filter((chapter) => chapter.title.length > 0);

    return {
      chapters,
      identifyingChapters: chapters.map((chapter) => chapter.title),
    };
  }

  private async assertStoryOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    if (story.userId !== userId) {
      throw new ForbiddenException();
    }

    return story;
  }

  private async assertPassageOwnership(passageId: string, userId: string) {
    const passage = await this.prisma.passage.findUnique({
      where: { id: passageId },
      include: {
        story: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!passage) {
      throw new NotFoundException('Passage not found');
    }

    if (passage.story.userId !== userId) {
      throw new ForbiddenException();
    }

    return passage;
  }

  private async assertNoteOwnership(noteId: string, userId: string) {
    const note = await this.prisma.passageNote.findUnique({
      where: { id: noteId },
      include: {
        passage: {
          include: {
            story: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!note) {
      throw new NotFoundException('Passage note not found');
    }

    if (note.passage.story.userId !== userId) {
      throw new ForbiddenException();
    }

    return note;
  }

  private async getNextOrder(storyId: string): Promise<number> {
    const lastPassage = await this.prisma.passage.findFirst({
      where: { storyId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    return lastPassage ? lastPassage.order + 1 : 1;
  }

  async listForStory(storyId: string, userId: string) {
    await this.assertStoryOwnership(storyId, userId);

    return this.prisma.passage.findMany({
      where: { storyId },
      orderBy: { order: 'asc' },
      include: {
        notes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async create(storyId: string, userId: string, dto: CreatePassageDto) {
    await this.assertStoryOwnership(storyId, userId);
    const order = dto.order ?? (await this.getNextOrder(storyId));

    const passage = await this.prisma.passage.create({
      data: {
        storyId,
        title: dto.title ?? 'Untitled Passage',
        order,
        visible: dto.visible ?? true,
      },
    });

    return this.recomputeMetadata(passage.id);
  }

  async update(passageId: string, userId: string, dto: UpdatePassageDto) {
    await this.assertPassageOwnership(passageId, userId);

    const updated = await this.prisma.passage.update({
      where: { id: passageId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
      },
    });

    return this.recomputeMetadata(updated.id);
  }

  async delete(passageId: string, userId: string) {
    await this.assertPassageOwnership(passageId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.block.deleteMany({ where: { passageId } });
      await tx.passage.delete({ where: { id: passageId } });
    });

    return { id: passageId, deleted: true };
  }

  async recomputeMetadata(passageId: string) {
    const passage = await this.prisma.passage.findUnique({
      where: { id: passageId },
      select: {
        id: true,
        storyId: true,
      },
    });

    if (!passage) {
      throw new NotFoundException('Passage not found');
    }

    const blocks = await this.prisma.block.findMany({
      where: { passageId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        type: true,
        content: true,
      },
    });

    const wordCount = blocks.reduce((sum, block) => sum + this.countWords(block.content), 0);

    const threadCount = await this.prisma.thread.count({
      where: {
        block: {
          passageId,
        },
      },
    });

    const references = await this.prisma.referenceOccurrence.findMany({
      where: {
        block: {
          passageId,
        },
      },
      select: {
        entityType: true,
        entityId: true,
      },
    });

    const characterIds = new Set<string>();
    const locationIds = new Set<string>();

    for (const reference of references) {
      if (reference.entityType === 'character') {
        characterIds.add(reference.entityId);
      }

      if (reference.entityType === 'location') {
        locationIds.add(reference.entityId);
      }
    }

    const { chapters, identifyingChapters } = this.extractChapterMetadata(blocks);

    await this.prisma.passage.update({
      where: { id: passageId },
      data: {
        wordCount,
        threadCount,
        characterCount: characterIds.size,
        locationCount: locationIds.size,
        chapters: chapters as object[],
        identifyingChapters,
      },
    });

    return this.prisma.passage.findUnique({
      where: { id: passageId },
      include: {
        notes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async listNotes(passageId: string, userId: string) {
    await this.assertPassageOwnership(passageId, userId);

    return this.prisma.passageNote.findMany({
      where: { passageId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createNote(passageId: string, userId: string, dto: CreatePassageNoteDto) {
    await this.assertPassageOwnership(passageId, userId);

    return this.prisma.passageNote.create({
      data: {
        passageId,
        content: dto.content,
      },
    });
  }

  async updateNote(noteId: string, userId: string, dto: UpdatePassageNoteDto) {
    await this.assertNoteOwnership(noteId, userId);

    return this.prisma.passageNote.update({
      where: { id: noteId },
      data: {
        ...(dto.content !== undefined ? { content: dto.content } : {}),
      },
    });
  }

  async deleteNote(noteId: string, userId: string) {
    await this.assertNoteOwnership(noteId, userId);
    await this.prisma.passageNote.delete({ where: { id: noteId } });
    return { id: noteId, deleted: true };
  }
}
