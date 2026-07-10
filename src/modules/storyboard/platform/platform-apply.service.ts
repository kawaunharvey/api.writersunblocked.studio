import { PrismaService } from '@/database/prisma.service';
import { IntelligenceOrchestratorService } from '@/modules/story-intelligence/services/intelligence-orchestrator.service';
import { PlatformAction } from '@/modules/platform/platform.types';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppliedEntityType,
  PlatformStatus,
} from '@prisma/client';
import { MentionsService } from '../modules/mentions/mentions.service';
import { NotesService } from '../modules/notes/notes.service';
import { ScenesService } from '../../scenes/scenes.service';
import { PlatformPersistenceService } from './platform-persistence.service';

type PlatformDataField = {
  label: string;
  type: string;
  value: string;
};

const fieldValue = (
  data: PlatformDataField[],
  label: string,
): string | undefined => {
  const value = data.find((field) => field.label === label)?.value;
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return String(value);
};

const toMentionType = (value?: string): 'person' | 'place' | 'thing' => {
  if (value === 'place' || value === 'thing') {
    return value;
  }
  return 'person';
};

@Injectable()
export class PlatformApplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly persistenceService: PlatformPersistenceService,
    private readonly mentionsService: MentionsService,
    private readonly scenesService: ScenesService,
    private readonly notesService: NotesService,
    private readonly intelligenceOrchestrator: IntelligenceOrchestratorService,
  ) {}

  private async getNextSceneOrder(storyId: string): Promise<number> {
    const latest = await this.prisma.scene.findFirst({
      where: { storyId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (latest?.order ?? 0) + 1;
  }

  private async upsertMentionAttributes(
    storyId: string,
    mentionId: string,
    data: PlatformDataField[],
  ) {
    const detailFields = data.filter(
      (field) => !field.label.startsWith('#') && field.value,
    );

    for (const field of detailFields) {
      const existing = await this.prisma.attribute.findFirst({
        where: {
          storyId,
          mentionId,
          label: field.label,
        },
      });

      if (existing) {
        await this.prisma.attribute.update({
          where: { id: existing.id },
          data: {
            value: String(field.value),
            type: field.type || 'text',
          },
        });
        continue;
      }

      await this.prisma.attribute.create({
        data: {
          storyId,
          mentionId,
          label: field.label,
          type: field.type || 'text',
          value: String(field.value),
        },
      });
    }
  }

  private async applyAction(
    storyId: string,
    userId: string,
    action: string,
    body: string | null,
    data: PlatformDataField[],
  ): Promise<{ appliedEntityId: string; appliedEntityType: AppliedEntityType }> {
    switch (action) {
      case PlatformAction.NEW_MENTION: {
        const name = fieldValue(data, '#StoryLabel');
        if (!name) {
          throw new BadRequestException('Missing mention name.');
        }

        const mention = await this.mentionsService.create(storyId, userId, {
          name,
          mentionType: toMentionType(fieldValue(data, '#MentionType')),
          status: 'confirmed',
          color: 'mist',
        });

        await this.upsertMentionAttributes(storyId, mention.id, data);

        return {
          appliedEntityId: mention.id,
          appliedEntityType: AppliedEntityType.mention,
        };
      }
      case PlatformAction.UPDATE_MENTION: {
        const mentionId = fieldValue(data, '#MentionId');
        if (!mentionId) {
          throw new BadRequestException('Missing mention id.');
        }

        const name = fieldValue(data, '#StoryLabel');
        await this.mentionsService.update(mentionId, userId, {
          ...(name ? { name } : {}),
        });
        await this.upsertMentionAttributes(storyId, mentionId, data);

        return {
          appliedEntityId: mentionId,
          appliedEntityType: AppliedEntityType.mention,
        };
      }
      case PlatformAction.NEW_SCENE: {
        const title =
          fieldValue(data, 'Summary') ??
          (body?.trim() || 'Untitled Scene');
        const order = await this.getNextSceneOrder(storyId);

        const createdScene = await this.scenesService.create(storyId, userId, {
          label: title,
          order,
          visible: true,
        });

        if (!createdScene?.id) {
          throw new BadRequestException('Failed to create scene.');
        }

        return {
          appliedEntityId: createdScene.id,
          appliedEntityType: AppliedEntityType.scene,
        };
      }
      case PlatformAction.UPDATE_SCENE: {
        const sceneId = fieldValue(data, '#SceneId');
        if (!sceneId) {
          throw new BadRequestException('Missing scene id.');
        }

        const summary = fieldValue(data, 'Summary');
        await this.prisma.scene.update({
          where: { id: sceneId },
          data: {
            ...(summary ? { label: summary, summary } : {}),
          },
        });

        return {
          appliedEntityId: sceneId,
          appliedEntityType: AppliedEntityType.scene,
        };
      }
      case PlatformAction.NEW_NOTE: {
        const noteBody = fieldValue(data, 'Body') ?? body?.trim();
        if (!noteBody) {
          throw new BadRequestException('Missing note body.');
        }

        const note = await this.notesService.create(storyId, userId, {
          body: noteBody,
          color: 'amber',
        });

        return {
          appliedEntityId: note.id,
          appliedEntityType: AppliedEntityType.note,
        };
      }
      case PlatformAction.UPDATE_NOTE: {
        const noteId = fieldValue(data, '#NoteId');
        if (!noteId) {
          throw new BadRequestException('Missing note id.');
        }

        const noteBody = fieldValue(data, 'Body');
        const note = await this.prisma.note.findFirst({
          where: { id: noteId, storyId },
        });
        if (!note) {
          throw new NotFoundException('Note not found');
        }

        if (noteBody) {
          await this.prisma.note.update({
            where: { id: noteId },
            data: { body: noteBody },
          });
        }

        return {
          appliedEntityId: noteId,
          appliedEntityType: AppliedEntityType.note,
        };
      }
      default:
        throw new BadRequestException(`Unsupported platform action: ${action}`);
    }
  }

  async applyItem(storyId: string, userId: string, itemId: string) {
    const item = await this.persistenceService.getItem(storyId, itemId, userId);

    if (item.status === PlatformStatus.APPROVED) {
      return {
        item: this.persistenceService.mapItem(item),
        appliedEntityId: item.appliedEntityId,
        appliedEntityType: item.appliedEntityType,
        intelligenceQueued: false,
        idempotent: true,
      };
    }

    if (item.status === PlatformStatus.REJECTED) {
      throw new BadRequestException('Cannot apply a rejected platform item.');
    }

    if (!item.action) {
      throw new BadRequestException('Platform item is missing an action.');
    }

    const applied = await this.applyAction(
      storyId,
      userId,
      item.action,
      item.body,
      item.data,
    );

    const updated = await this.prisma.platformItem.update({
      where: { id: itemId },
      data: {
        status: PlatformStatus.APPROVED,
        approvedAt: new Date(),
        appliedEntityId: applied.appliedEntityId,
        appliedEntityType: applied.appliedEntityType,
      },
    });

    const post = item.postId
      ? await this.prisma.platformPost.findUnique({
          where: { id: item.postId },
        })
      : null;

    const plainText = item.body?.trim() || post?.body?.trim() || '';
    let intelligenceQueued = false;

    if (plainText) {
      const intelligenceResult = await this.intelligenceOrchestrator.recordAndEnqueue({
        storyId,
        userId,
        source: 'platform',
        canonStatus: 'intent',
        plainText,
        mentionId:
          applied.appliedEntityType === AppliedEntityType.mention
            ? applied.appliedEntityId
            : undefined,
        sceneId:
          applied.appliedEntityType === AppliedEntityType.scene
            ? applied.appliedEntityId
            : undefined,
        noteId:
          applied.appliedEntityType === AppliedEntityType.note
            ? applied.appliedEntityId
            : undefined,
        metadata: {
          platformItemId: itemId,
          platformPostId: item.postId,
          action: item.action,
        },
      });
      intelligenceQueued = intelligenceResult.queued;
    }

    return {
      item: this.persistenceService.mapItem(updated),
      appliedEntityId: applied.appliedEntityId,
      appliedEntityType: applied.appliedEntityType,
      sceneShortId:
        applied.appliedEntityType === AppliedEntityType.scene
          ? (
              await this.prisma.scene.findUnique({
                where: { id: applied.appliedEntityId },
                select: { shortId: true },
              })
            )?.shortId ?? null
          : null,
      intelligenceQueued,
      idempotent: false,
    };
  }

  async rejectItem(
    storyId: string,
    userId: string,
    itemId: string,
    reason?: string,
  ) {
    const item = await this.persistenceService.getItem(storyId, itemId, userId);

    if (item.status === PlatformStatus.APPROVED) {
      throw new BadRequestException('Cannot reject an approved platform item.');
    }

    const updated = await this.prisma.platformItem.update({
      where: { id: itemId },
      data: {
        status: PlatformStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    });

    return {
      item: this.persistenceService.mapItem(updated),
    };
  }
}
