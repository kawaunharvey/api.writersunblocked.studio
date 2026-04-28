import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { EVENT_GROUP, EVENT_TYPE } from '../events/event.constants'
import { EventsService } from '../events/events.service'
import { ProgressGateway } from '../gateway/progress.gateway'
import {
    CreateStoryboardCommentDto,
    ListStoryboardCommentsQueryDto,
    UpdateStoryboardCommentDto,
} from './storyboard-comments.dto'

@Injectable()
export class StoryboardCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly gateway: ProgressGateway,
  ) {}

  private async assertStoryOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true },
    })

    if (!story) {
      throw new NotFoundException('Story not found')
    }

    if (story.userId !== userId) {
      throw new ForbiddenException()
    }

    return story
  }

  private async assertBlockBelongsToStory(blockId: string, storyId: string) {
    const block = await this.prisma.block.findUnique({
      where: { id: blockId },
      select: { id: true, storyId: true },
    })

    if (!block) {
      throw new NotFoundException('Block not found')
    }

    if (block.storyId !== storyId) {
      throw new BadRequestException('Block does not belong to story')
    }

    return block
  }

  private async assertCommentExists(commentId: string) {
    const comment = await this.prisma.storyboardComment.findUnique({
      where: { id: commentId },
      include: {
        story: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    })

    if (!comment) {
      throw new NotFoundException('Storyboard comment not found')
    }

    return comment
  }

  private assertCanMutateComment(storyOwnerId: string, commentAuthorId: string, userId: string) {
    if (userId !== storyOwnerId && userId !== commentAuthorId) {
      throw new ForbiddenException()
    }
  }

  private buildThreadTree<T extends { id: string; parentId: string | null }>(comments: T[]) {
    const nodeMap = new Map<string, (T & { replies: Array<T & { replies: unknown[] }> })>()

    for (const comment of comments) {
      nodeMap.set(comment.id, { ...comment, replies: [] })
    }

    const roots: Array<T & { replies: Array<T & { replies: unknown[] }> }> = []

    for (const comment of comments) {
      const node = nodeMap.get(comment.id)!
      if (!comment.parentId) {
        roots.push(node)
        continue
      }

      const parent = nodeMap.get(comment.parentId)
      if (!parent) {
        roots.push(node)
        continue
      }

      parent.replies.push(node)
    }

    return roots
  }

  private collectDescendantIds(
    rootCommentId: string,
    comments: Array<{ id: string; parentId: string | null }>,
  ): string[] {
    const childrenByParent = new Map<string, string[]>()

    for (const comment of comments) {
      if (!comment.parentId) continue
      const existing = childrenByParent.get(comment.parentId) ?? []
      existing.push(comment.id)
      childrenByParent.set(comment.parentId, existing)
    }

    const stack = [rootCommentId]
    const toDelete: string[] = []

    while (stack.length) {
      const current = stack.pop()!
      toDelete.push(current)

      for (const childId of childrenByParent.get(current) ?? []) {
        stack.push(childId)
      }
    }

    return toDelete
  }

  async list(storyId: string, userId: string, query: ListStoryboardCommentsQueryDto) {
    await this.assertStoryOwnership(storyId, userId)

    const includeResolved = query.includeResolved !== 'false'

    const comments = await this.prisma.storyboardComment.findMany({
      where: {
        storyId,
        ...(query.blockId ? { blockId: query.blockId } : {}),
        ...(includeResolved ? {} : { resolvedAt: null }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            handle: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return this.buildThreadTree(comments)
  }

  async create(storyId: string, userId: string, dto: CreateStoryboardCommentDto) {
    await this.assertStoryOwnership(storyId, userId)
    await this.assertBlockBelongsToStory(dto.blockId, storyId)

    if (dto.parentId) {
      const parent = await this.prisma.storyboardComment.findUnique({
        where: { id: dto.parentId },
        select: {
          id: true,
          storyId: true,
          blockId: true,
        },
      })

      if (!parent) {
        throw new NotFoundException('Parent comment not found')
      }

      if (parent.storyId !== storyId) {
        throw new BadRequestException('Parent comment does not belong to story')
      }

      if (parent.blockId !== dto.blockId) {
        throw new BadRequestException('Reply must target the same block as the parent comment')
      }
    }

    if ((dto.anchorOffset ?? 0) > 0 && dto.anchorLength === undefined) {
      throw new BadRequestException('anchorLength is required when anchorOffset is provided')
    }

    const created = await this.prisma.storyboardComment.create({
      data: {
        storyId,
        blockId: dto.blockId,
        userId,
        parentId: dto.parentId,
        body: dto.body,
        anchorOffset: dto.anchorOffset,
        anchorLength: dto.anchorLength,
        anchorText: dto.anchorText,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            handle: true,
          },
        },
      },
    })

    this.events.record({
      eventType: EVENT_TYPE.STORYBOARD_COMMENT_CREATED,
      eventGroup: EVENT_GROUP.COMMENTS,
      source: StoryboardCommentsService.name,
      status: 'success',
      userId,
      storyId,
      metadata: {
        commentId: created.id,
        blockId: created.blockId,
        parentId: created.parentId,
        hasAnchor: created.anchorLength !== null && created.anchorLength !== undefined && created.anchorLength > 0,
      },
    })

    this.gateway.emitStoryboardCommentCreated(storyId, created)

    return created
  }

  async update(storyId: string, commentId: string, userId: string, dto: UpdateStoryboardCommentDto) {
    await this.assertStoryOwnership(storyId, userId)
    const comment = await this.assertCommentExists(commentId)

    if (comment.storyId !== storyId) {
      throw new BadRequestException('Comment does not belong to story')
    }

    this.assertCanMutateComment(comment.story.userId, comment.userId, userId)

    const updated = await this.prisma.storyboardComment.update({
      where: { id: commentId },
      data: {
        ...(dto.body !== undefined ? { body: dto.body } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            handle: true,
          },
        },
      },
    })

    this.events.record({
      eventType: EVENT_TYPE.STORYBOARD_COMMENT_UPDATED,
      eventGroup: EVENT_GROUP.COMMENTS,
      source: StoryboardCommentsService.name,
      status: 'success',
      userId,
      storyId,
      metadata: {
        commentId: updated.id,
        blockId: updated.blockId,
      },
    })

    this.gateway.emitStoryboardCommentUpdated(storyId, updated)

    return updated
  }

  async remove(storyId: string, commentId: string, userId: string) {
    await this.assertStoryOwnership(storyId, userId)
    const comment = await this.assertCommentExists(commentId)

    if (comment.storyId !== storyId) {
      throw new BadRequestException('Comment does not belong to story')
    }

    this.assertCanMutateComment(comment.story.userId, comment.userId, userId)

    const commentsInStory = await this.prisma.storyboardComment.findMany({
      where: { storyId },
      select: {
        id: true,
        parentId: true,
      },
    })

    const idsToDelete = this.collectDescendantIds(commentId, commentsInStory)

    await this.prisma.storyboardComment.deleteMany({
      where: {
        id: {
          in: idsToDelete,
        },
      },
    })

    this.events.record({
      eventType: EVENT_TYPE.STORYBOARD_COMMENT_DELETED,
      eventGroup: EVENT_GROUP.COMMENTS,
      source: StoryboardCommentsService.name,
      status: 'success',
      userId,
      storyId,
      metadata: {
        commentId,
        blockId: comment.blockId,
        deletedCount: idsToDelete.length,
      },
    })

    this.gateway.emitStoryboardCommentDeleted(storyId, {
      commentId,
      blockId: comment.blockId,
      deletedIds: idsToDelete,
    })

    return { id: commentId, deleted: true, deletedCount: idsToDelete.length }
  }

  async resolve(storyId: string, commentId: string, userId: string) {
    const story = await this.assertStoryOwnership(storyId, userId)
    const comment = await this.assertCommentExists(commentId)

    if (comment.storyId !== storyId) {
      throw new BadRequestException('Comment does not belong to story')
    }

    if (story.userId !== userId) {
      throw new ForbiddenException()
    }

    const updated = await this.prisma.storyboardComment.update({
      where: { id: commentId },
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            handle: true,
          },
        },
      },
    })

    this.events.record({
      eventType: EVENT_TYPE.STORYBOARD_COMMENT_RESOLVED,
      eventGroup: EVENT_GROUP.COMMENTS,
      source: StoryboardCommentsService.name,
      status: 'success',
      userId,
      storyId,
      metadata: {
        commentId,
        blockId: updated.blockId,
      },
    })

    this.gateway.emitStoryboardCommentResolved(storyId, updated)

    return updated
  }

  async reopen(storyId: string, commentId: string, userId: string) {
    const story = await this.assertStoryOwnership(storyId, userId)
    const comment = await this.assertCommentExists(commentId)

    if (comment.storyId !== storyId) {
      throw new BadRequestException('Comment does not belong to story')
    }

    if (story.userId !== userId) {
      throw new ForbiddenException()
    }

    const updated = await this.prisma.storyboardComment.update({
      where: { id: commentId },
      data: {
        resolvedAt: null,
        resolvedByUserId: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            handle: true,
          },
        },
      },
    })

    this.events.record({
      eventType: EVENT_TYPE.STORYBOARD_COMMENT_REOPENED,
      eventGroup: EVENT_GROUP.COMMENTS,
      source: StoryboardCommentsService.name,
      status: 'success',
      userId,
      storyId,
      metadata: {
        commentId,
        blockId: updated.blockId,
      },
    })

    this.gateway.emitStoryboardCommentReopened(storyId, updated)

    return updated
  }
}
