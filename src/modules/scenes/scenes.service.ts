import { PrismaService } from "@/database/prisma.service";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CreateSceneDto,
  CreateSceneNoteDto,
  UpdateSceneDto,
  UpdateSceneNoteDto,
} from "./scenes.dto";

type SceneDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ScenesService {
  constructor(private readonly prisma: PrismaService) {}

  private countWords(content: string): number {
    const tokens = content.trim().match(/\S+/g);
    return tokens ? tokens.length : 0;
  }

  private extractChapterMetadata(
    blocks: Array<{ id: string; type: string; content: string }>,
  ) {
    const chapters = blocks
      .filter((block) => block.type === "chapter")
      .map((block) => ({ id: block.id, title: block.content.trim() }))
      .filter((chapter) => chapter.title.length > 0);

    return {
      chapters,
    };
  }

  private async assertStoryOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true },
    });

    if (!story) {
      throw new NotFoundException("Story not found");
    }

    if (story.userId !== userId) {
      throw new ForbiddenException();
    }

    return story;
  }

  async assertOwnership(sceneId: string, userId: string) {
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      include: {
        story: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!scene) {
      throw new NotFoundException("Scene not found");
    }

    if (scene.story.userId !== userId) {
      throw new ForbiddenException();
    }

    return scene;
  }

  private async assertNoteOwnership(noteId: string, userId: string) {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      include: {
        scene: {
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
      throw new NotFoundException("Scene note not found");
    }

    if (note.scene?.story.userId !== userId) {
      throw new ForbiddenException();
    }

    return note;
  }

  private async getNextOrder(storyId: string): Promise<number> {
    const lastScene = await this.prisma.scene.findFirst({
      where: { storyId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    return lastScene ? lastScene.order + 1 : 1;
  }

  async listForStory(storyId: string, userId: string) {
    await this.assertStoryOwnership(storyId, userId);

    const sceneInclude = {
      notes: {
        orderBy: { createdAt: "asc" as const },
      },
      versions: {
        orderBy: { createdAt: "asc" as const },
      },
    };

    let scenes = await this.prisma.scene.findMany({
      where: { storyId },
      orderBy: { order: "asc" },
      include: sceneInclude,
    });

    const scenesNeedingVersions = scenes.filter(
      (scene) => !scene.activeVersionId || scene.versions.length === 0,
    );

    if (scenesNeedingVersions.length >= 0) {
      await Promise.all(
        scenesNeedingVersions.map((scene) =>
          this.createInitialVersion(scene.id),
        ),
      );

      scenes = await this.prisma.scene.findMany({
        where: { storyId },
        orderBy: { order: "asc" },
        include: sceneInclude,
      });
    }

    const sceneIds = scenes.map((p) => p.id);

    const occurrenceRows = await this.prisma.mentioned.findMany({
      where: { sceneId: { in: sceneIds } },
      select: { sceneId: true, mentionId: true },
    });

    const uniqueMentionIds = [
      ...new Set(occurrenceRows.map((o) => o.mentionId)),
    ];
    const mentionRows =
      uniqueMentionIds.length > 0
        ? await this.prisma.mention.findMany({
            where: { id: { in: uniqueMentionIds } },
            select: { id: true, name: true, color: true, mentionType: true },
          })
        : [];
    const mentionById = new Map(mentionRows.map((m) => [m.id, m]));

    type MentionRow = (typeof mentionRows)[number];
    const sceneMentionMap = new Map<string, Map<string, MentionRow>>();
    for (const occ of occurrenceRows) {
      if (!occ.sceneId) continue;
      const mention = mentionById.get(occ.mentionId);
      if (!mention) continue;
      if (!sceneMentionMap.has(occ.sceneId))
        sceneMentionMap.set(occ.sceneId, new Map());
      sceneMentionMap.get(occ.sceneId)!.set(occ.mentionId, mention);
    }

    return scenes.map((scene) => {
      const mentionsInScene = [
        ...(sceneMentionMap.get(scene.id)?.values() ?? []),
      ];
      return {
        ...scene,
        mentions: mentionsInScene,
        characters: mentionsInScene.filter((m) => m.mentionType === "person"),
        locations: mentionsInScene.filter((m) => m.mentionType === "place"),
      };
    });
  }

  private generateShortId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  private sceneWithVersionsInclude = {
    versions: {
      orderBy: { createdAt: "asc" as const },
    },
  };

  async createInitialVersion(
    sceneId: string,
    client: SceneDbClient = this.prisma,
  ) {
    const scene = await client.scene.findUnique({
      where: { id: sceneId },
      select: {
        id: true,
        activeVersionId: true,
        _count: { select: { versions: true } },
      },
    });

    if (!scene) {
      throw new NotFoundException("Scene not found");
    }

    if (scene._count.versions > 0) {
      if (scene.activeVersionId) {
        return client.scene.findUnique({
          where: { id: sceneId },
          include: this.sceneWithVersionsInclude,
        });
      }

      const firstVersion = await client.sceneVersion.findFirst({
        where: { sceneId },
        orderBy: { createdAt: "asc" },
      });

      if (!firstVersion) {
        return client.scene.findUnique({
          where: { id: sceneId },
          include: this.sceneWithVersionsInclude,
        });
      }

      return client.scene.update({
        where: { id: sceneId },
        data: { activeVersionId: firstVersion.id },
        include: this.sceneWithVersionsInclude,
      });
    }

    const version = await client.sceneVersion.create({
      data: {
        sceneId,
        shortId: this.generateShortId(),
      },
    });

    return client.scene.update({
      where: { id: sceneId },
      data: { activeVersionId: version.id },
      include: this.sceneWithVersionsInclude,
    });
  }

  async create(storyId: string, userId: string, dto: CreateSceneDto) {
    await this.assertStoryOwnership(storyId, userId);
    const order = dto.order ?? (await this.getNextOrder(storyId));

    const scene = await this.prisma.$transaction(async (tx) => {
      const created = await tx.scene.create({
        data: {
          storyId,
          label: dto.label ?? "Untitled Scene",
          shortId: this.generateShortId(),
          order,
          visible: dto.visible ?? true,
          settings: {
            pov: "first",
            tense: "present",
            perspective: null,
          },
        },
      });

      return this.createInitialVersion(created.id, tx);
    });

    return scene;
  }

  async updateActiveVersionContent(
    sceneId: string,
    userId: string,
    dto: {
      content?: string;
      contentJSON?: Record<string, unknown>;
      wordCount?: number;
    },
  ) {
    await this.assertOwnership(sceneId, userId);

    let scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      select: { activeVersionId: true },
    });

    if (!scene?.activeVersionId) {
      await this.createInitialVersion(sceneId);
      scene = await this.prisma.scene.findUnique({
        where: { id: sceneId },
        select: { activeVersionId: true },
      });
    }

    if (!scene?.activeVersionId) {
      throw new NotFoundException("Scene has no active version");
    }

    await this.prisma.sceneVersion.update({
      where: { id: scene.activeVersionId },
      data: {
        ...(dto.contentJSON !== undefined
          ? { data: dto.contentJSON as Prisma.InputJsonValue }
          : {}),
        ...(dto.content !== undefined ? { plainText: dto.content } : {}),
        ...(dto.wordCount !== undefined ? { wordCount: dto.wordCount } : {}),
      },
    });

    return this.prisma.scene.findUnique({
      where: { id: sceneId },
      include: this.sceneWithVersionsInclude,
    });
  }

  async setActiveVersion(
    sceneId: string,
    userId: string,
    activeVersionId: string,
  ) {
    await this.assertOwnership(sceneId, userId);

    const version = await this.prisma.sceneVersion.findFirst({
      where: { id: activeVersionId, sceneId },
    });

    if (!version) {
      throw new NotFoundException("Scene version not found");
    }

    return this.prisma.scene.update({
      where: { id: sceneId },
      data: { activeVersionId },
      include: this.sceneWithVersionsInclude,
    });
  }

  async update(sceneId: string, userId: string, dto: UpdateSceneDto) {
    await this.assertOwnership(sceneId, userId);

    const updated = await this.prisma.scene.update({
      where: { id: sceneId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
      },
    });

    return this.recomputeMetadata(updated.id);
  }

  async delete(sceneId: string, userId: string) {
    await this.assertOwnership(sceneId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.scene.delete({ where: { id: sceneId } });
    });

    return { id: sceneId, deleted: true };
  }

  async recomputeMetadata(sceneId: string) {
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      select: {
        id: true,
        storyId: true,
      },
    });

    if (!scene) {
      throw new NotFoundException("Scene not found");
    }

    const wordCount = 0;

    const occurrences = await this.prisma.mentioned.findMany({
      where: { sceneId },
      select: { mentionId: true },
    });

    const uniqueRefIds = [...new Set(occurrences.map((o) => o.mentionId))];
    const refMentions =
      uniqueRefIds.length > 0
        ? await this.prisma.mention.findMany({
            where: { id: { in: uniqueRefIds } },
            select: { id: true, mentionType: true },
          })
        : [];

    const personMentionIds = new Set<string>();
    const placeMentionIds = new Set<string>();

    for (const m of refMentions) {
      if (m.mentionType === "person") personMentionIds.add(m.id);
      else if (m.mentionType === "place") placeMentionIds.add(m.id);
    }

    return this.prisma.scene.findUnique({
      where: { id: sceneId },
    });
  }

  async listNotes(sceneId: string, userId: string) {
    await this.assertOwnership(sceneId, userId);

    return this.prisma.note.findMany({
      where: { sceneId },
      orderBy: { createdAt: "asc" },
    });
  }

  async createNote(sceneId: string, userId: string, dto: CreateSceneNoteDto) {
    await this.assertOwnership(sceneId, userId);

    // return this.prisma.note.create({
    //   data: {
    //     sceneId,
    //     body: dto.content,
    //   },
    // });
    return {};
  }

  async updateNote(noteId: string, userId: string, dto: UpdateSceneNoteDto) {
    await this.assertNoteOwnership(noteId, userId);

    return this.prisma.note.update({
      where: { id: noteId },
      data: {
        ...(dto.content !== undefined ? { body: dto.content } : {}),
      },
    });
  }

  async deleteNote(noteId: string, userId: string) {
    await this.assertNoteOwnership(noteId, userId);
    await this.prisma.note.delete({ where: { id: noteId } });
    return { id: noteId, deleted: true };
  }
}
