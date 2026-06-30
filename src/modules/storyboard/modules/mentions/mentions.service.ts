import { PrismaService } from "@/database/prisma.service";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ConfirmMentionDto,
  CreateMentionDto,
  MentionStatus,
  MentionType,
  UpdateMentionDto,
} from "./mentions.dto";

type MentionOrganizerMetadata = {
  childrenByGroupId?: Record<string, string[]>;
};

@Injectable()
export class MentionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStoryOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) throw new NotFoundException("Story not found");
    if (story.userId !== userId) throw new ForbiddenException();
    return story;
  }

  private async assertMentionOwnership(mentionId: string, userId: string) {
    const mention = await this.prisma.mention.findUnique({
      where: { id: mentionId },
    });
    if (!mention) throw new NotFoundException("Mention not found");
    if (mention.userId !== userId) throw new ForbiddenException();
    return mention;
  }

  private async removeGroupFromMentionOrganizer(
    storyId: string,
    groupId: string,
  ) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story?.settings?.metadata) {
      return;
    }

    const metadata = story.settings.metadata as Record<string, unknown>;
    const mentionOrganizer = metadata.mentionOrganizer as
      | MentionOrganizerMetadata
      | undefined;

    if (!mentionOrganizer?.childrenByGroupId?.[groupId]) {
      return;
    }

    const { [groupId]: _, ...childrenByGroupId } =
      mentionOrganizer.childrenByGroupId;
    const currentSettings = story.settings;
    const nextMetadata = {
      ...metadata,
      mentionOrganizer: {
        ...mentionOrganizer,
        childrenByGroupId,
      },
    };

    await this.prisma.story.update({
      where: { id: storyId },
      data: {
        settings: {
          set: {
            sceneDefaults: currentSettings.sceneDefaults ?? {
              pov: "first",
              tense: "present",
              perspective: null,
            },
            metadata: nextMetadata as Prisma.InputJsonValue,
            updatedAt: new Date(),
          },
        },
      },
    });
  }

  async getById(storyId: string, mentionId: string) {
    return await this.prisma.mention.findUnique({ where: { id: mentionId } });
  }

  async list(
    storyId: string,
    userId: string,
    filters?: { mentionType?: MentionType; status?: MentionStatus },
  ) {
    await this.assertStoryOwnership(storyId, userId);

    return this.prisma.mention.findMany({
      where: {
        storyId,
        ...(filters?.mentionType ? { mentionType: filters.mentionType } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: [{ mentionCount: "desc" }, { createdAt: "asc" }],
    });
  }

  async create(storyId: string, userId: string, dto: CreateMentionDto) {
    await this.assertStoryOwnership(storyId, userId);

    return this.prisma.mention.create({
      data: {
        storyId,
        userId,
        name: dto.name,
        mentionType: dto.mentionType ?? "thing",
        status: dto.status ?? "pending",
        color: dto.color,
        aliases: dto.aliases as object[] | undefined,
        metadata: dto.metadata as object | undefined,
      },
    });
  }

  async update(mentionId: string, userId: string, dto: UpdateMentionDto) {
    await this.assertMentionOwnership(mentionId, userId);

    return this.prisma.mention.update({
      where: { id: mentionId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.mentionType !== undefined
          ? { mentionType: dto.mentionType }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.aliases !== undefined
          ? { aliases: dto.aliases as object[] }
          : {}),
        ...(dto.metadata !== undefined
          ? { metadata: dto.metadata as object }
          : {}),
        ...(dto.mentionCount !== undefined
          ? { mentionCount: dto.mentionCount }
          : {}),
      },
    });
  }

  async confirm(mentionId: string, userId: string, dto: ConfirmMentionDto) {
    await this.assertMentionOwnership(mentionId, userId);

    return this.prisma.mention.update({
      where: { id: mentionId },
      data: {
        mentionType: dto.mentionType,
        status: "confirmed",
      },
    });
  }

  async delete(mentionId: string, userId: string) {
    const mention = await this.assertMentionOwnership(mentionId, userId);

    if (mention.mentionType === "group") {
      await this.removeGroupFromMentionOrganizer(mention.storyId, mentionId);
    }

    await this.prisma.mention.delete({ where: { id: mentionId } });
  }
}
