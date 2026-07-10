import { PrismaService } from '@/database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppliedEntityType,
  EntityType,
  PlatformInputType,
  PlatformStatus,
  Prisma,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { STORYBOARD_PLATFORM_QUEUE } from '../worker/platform/platform.constants';
import type { CreatePlatformPostDto } from './platform-persistence.dto';

const entityTypeByPlatformInput: Record<
  CreatePlatformPostDto['platformType'],
  EntityType
> = {
  input: EntityType.PLATFORM,
  note: EntityType.NOTE,
  comment: EntityType.COMMENT,
  link: EntityType.PLATFORM,
};

@Injectable()
export class PlatformPersistenceService {
  constructor(
    @InjectQueue(STORYBOARD_PLATFORM_QUEUE)
    private readonly platformQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  private async assertStoryOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) {
      throw new NotFoundException('Story not found');
    }
    if (story.userId !== userId) {
      throw new ForbiddenException();
    }
    return story;
  }

  private mapPost(post: {
    id: string;
    storyId: string;
    platformType: PlatformInputType;
    type: EntityType;
    body: string | null;
    color: string | null;
    content: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
      id: string;
      storyId: string;
      action: string | null;
      body: string | null;
      data: Array<{ label: string; type: string; value: string }>;
      status: PlatformStatus;
      appliedEntityId: string | null;
      appliedEntityType: AppliedEntityType | null;
      rejectionReason: string | null;
      createdAt: Date;
      updatedAt: Date;
      approvedAt: Date | null;
      rejectedAt: Date | null;
    }>;
  }) {
    return {
      id: post.id,
      storyId: post.storyId,
      platformType: post.platformType,
      type: post.type,
      body: post.body,
      color: post.color,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      items: post.items.map((item) => this.mapItem(item)),
    };
  }

  mapItem(item: {
    id: string;
    storyId: string;
    action: string | null;
    body: string | null;
    data: Array<{ label: string; type: string; value: string }>;
    status: PlatformStatus;
    postId?: string | null;
    appliedEntityId: string | null;
    appliedEntityType: AppliedEntityType | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    approvedAt: Date | null;
    rejectedAt: Date | null;
  }) {
    return {
      id: item.id,
      storyId: item.storyId,
      postId: item.postId ?? null,
      action: item.action,
      body: item.body,
      data: item.data.map((field) => ({
        label: field.label,
        type: field.type,
        value: field.value,
      })),
      status: item.status,
      appliedEntityId: item.appliedEntityId,
      appliedEntityType: item.appliedEntityType,
      rejectionReason: item.rejectionReason,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      approvedAt: item.approvedAt?.toISOString() ?? null,
      rejectedAt: item.rejectedAt?.toISOString() ?? null,
    };
  }

  async listPosts(storyId: string, userId: string) {
    await this.assertStoryOwnership(storyId, userId);

    const posts = await this.prisma.platformPost.findMany({
      where: { storyId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return posts.map((post) => this.mapPost(post));
  }

  async createPost(storyId: string, userId: string, dto: CreatePlatformPostDto) {
    await this.assertStoryOwnership(storyId, userId);

    const post = await this.prisma.platformPost.create({
      data: {
        userId,
        storyId,
        platformType: dto.platformType as PlatformInputType,
        type: entityTypeByPlatformInput[dto.platformType],
        body: dto.body,
        color: dto.color,
        ...(dto.content !== undefined
          ? { content: dto.content as Prisma.InputJsonValue }
          : {}),
      },
    });

    const jobId = `${STORYBOARD_PLATFORM_QUEUE}-${post.id}`;
    const existing = await this.platformQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'delayed' || state === 'completed') {
        await existing.remove();
      }
    }

    await this.platformQueue.add(
      STORYBOARD_PLATFORM_QUEUE,
      {
        storyId,
        userId,
        postId: post.id,
        data: { body: dto.body },
      },
      { jobId, removeOnComplete: true, removeOnFail: true },
    );

    return {
      accepted: true,
      post: this.mapPost({ ...post, items: [] }),
    };
  }

  async getItem(storyId: string, itemId: string, userId: string) {
    await this.assertStoryOwnership(storyId, userId);

    const item = await this.prisma.platformItem.findFirst({
      where: { id: itemId, storyId },
    });

    if (!item) {
      throw new NotFoundException('Platform item not found');
    }

    return item;
  }
}
