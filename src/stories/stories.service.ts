import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { hashBlockContent } from '../blocks/block-content-hash'
import { PrismaService } from '../database/prisma.service'
import { PassagesService } from '../passages/passages.service'

type StoryDocumentNode = Record<string, unknown>;
type StoryDocument = { type?: unknown; content?: StoryDocumentNode[] };

type ReferenceSource = 'explicit' | 'inferred';

type ReferenceCandidate = {
  entityId: string;
  entityType: 'character' | 'location';
  text: string;
  color?: string;
  source: ReferenceSource;
  confidence: number;
};

type CharacterReferenceEntity = {
  id: string;
  name: string;
  color: string;
  aliases: unknown[];
};

type LocationReferenceEntity = {
  id: string;
  name: string;
  color: string;
};

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passagesService: PassagesService,
  ) {}

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2034'
    );
  }

  private referencePriority(candidate: Pick<ReferenceCandidate, 'source' | 'confidence'>): number {
    if (candidate.source === 'explicit') {
      return 10 + candidate.confidence;
    }

    return candidate.confidence;
  }

  private normalizeReferenceText(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractAliasValues(aliases: unknown[]): string[] {
    return aliases
      .map((alias) => {
        if (typeof alias === 'string') {
          return alias;
        }

        if (alias && typeof alias === 'object') {
          const label = (alias as { label?: unknown }).label;
          if (typeof label === 'string') {
            return label;
          }

          const name = (alias as { name?: unknown }).name;
          if (typeof name === 'string') {
            return name;
          }
        }

        return '';
      })
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private deriveCharacterNameParts(name: string): string[] {
    return name
      .split(/[\s-]+/)
      .map((value) => value.trim())
      .filter((value) => value.length >= 3);
  }

  private extractReferenceCandidates(contentJSON: Record<string, unknown>): ReferenceCandidate[] {
    const results: ReferenceCandidate[] = [];

    const pushReference = (
      type: 'character' | 'location',
      attrs: { id?: string; label?: string; color?: string } | undefined,
      textFromContent?: string,
    ) => {
      const entityId = attrs?.id?.trim();
      if (!entityId) return;

      const text = textFromContent?.trim() || attrs?.label?.trim() || entityId;
      results.push({
        entityId,
        entityType: type,
        text,
        color: attrs?.color,
        source: 'explicit',
        confidence: 1,
      });
    };

    const walk = (node: StoryDocumentNode) => {
      const nodeText = typeof node.text === 'string' ? node.text : '';

      if (node.type === 'characterReference' || node.type === 'characterRef' || node.type === 'mention') {
        pushReference(
          'character',
          node.attrs as { id?: string; label?: string; color?: string } | undefined,
          nodeText,
        );
      }

      if (node.type === 'locationReference' || node.type === 'locationRef') {
        pushReference(
          'location',
          node.attrs as { id?: string; label?: string; color?: string } | undefined,
          nodeText,
        );
      }

      const marks = Array.isArray(node.marks) ? (node.marks as StoryDocumentNode[]) : [];
      marks.forEach((mark) => {
        if (mark.type === 'characterReference' || mark.type === 'characterRef' || mark.type === 'mention') {
          pushReference(
            'character',
            mark.attrs as { id?: string; label?: string; color?: string } | undefined,
            nodeText,
          );
        }

        if (mark.type === 'locationReference' || mark.type === 'locationRef') {
          pushReference(
            'location',
            mark.attrs as { id?: string; label?: string; color?: string } | undefined,
            nodeText,
          );
        }
      });

      const children = Array.isArray(node.content) ? (node.content as StoryDocumentNode[]) : [];
      children.forEach(walk);
    };

    walk(contentJSON);
    return results;
  }

  private inferReferenceCandidatesFromText(
    content: string,
    entities: {
      characters: CharacterReferenceEntity[];
      locations: LocationReferenceEntity[];
    },
  ): ReferenceCandidate[] {
    const text = content.trim();
    if (!text) {
      return [];
    }

    const results: ReferenceCandidate[] = [];
    const matchedKeys = new Set<string>();

    const maybePush = (candidate: ReferenceCandidate) => {
      const normalizedText = this.normalizeReferenceText(candidate.text);
      if (!normalizedText) {
        return;
      }

      const key = `${candidate.entityType}:${candidate.entityId}:${normalizedText}`;
      if (matchedKeys.has(key)) {
        return;
      }

      const pattern = new RegExp(`\\b${this.escapeRegExp(candidate.text)}\\b`, 'i');
      if (!pattern.test(text)) {
        return;
      }

      matchedKeys.add(key);
      results.push(candidate);
    };

    for (const character of entities.characters) {
      const aliases = this.extractAliasValues(Array.isArray(character.aliases) ? character.aliases : []);
      const nameParts = this.deriveCharacterNameParts(character.name);
      const labelEntries = [
        { text: character.name, confidence: 0.86 },
        ...aliases.map((text) => ({ text, confidence: 0.78 })),
        ...nameParts.map((text) => ({ text, confidence: 0.68 })),
      ];

      const uniqueLabelEntries = new Map<string, { text: string; confidence: number }>();
      for (const entry of labelEntries) {
        const normalized = entry.text.trim();
        if (!normalized) continue;

        const existing = uniqueLabelEntries.get(normalized);
        if (!existing || entry.confidence > existing.confidence) {
          uniqueLabelEntries.set(normalized, { text: normalized, confidence: entry.confidence });
        }
      }

      for (const { text: trimmed, confidence } of uniqueLabelEntries.values()) {
        if (trimmed.length < 2) continue;

        maybePush({
          entityId: character.id,
          entityType: 'character',
          text: trimmed,
          color: character.color,
          source: 'inferred',
          confidence,
        });
      }
    }

    for (const location of entities.locations) {
      const trimmed = location.name.trim();
      if (trimmed.length < 2) continue;

      maybePush({
        entityId: location.id,
        entityType: 'location',
        text: trimmed,
        color: location.color,
        source: 'inferred',
        confidence: 0.8,
      });
    }

    return results;
  }

  private async syncReferencesForBlocks(
    tx: any,
    params: {
      storyId: string;
      userId: string;
      blocks: Array<{ id: string; content: string; contentJSON: Record<string, unknown> }>;
      replaceBlockIds?: string[];
    },
  ) {
    const [characters, locations] = await Promise.all([
      tx.character.findMany({
        where: {
          storyId: params.storyId,
          userId: params.userId,
        },
        select: {
          id: true,
          name: true,
          color: true,
          aliases: true,
        },
      }),
      tx.location.findMany({
        where: {
          storyId: params.storyId,
          userId: params.userId,
        },
        select: {
          id: true,
          name: true,
          color: true,
        },
      }),
    ]);

    if (params.replaceBlockIds && params.replaceBlockIds.length > 0) {
      await tx.referenceOccurrence.deleteMany({
        where: { storyId: params.storyId, blockId: { in: params.replaceBlockIds } },
      });
    } else {
      await tx.referenceOccurrence.deleteMany({ where: { storyId: params.storyId } });
    }

    const termCache = new Map<string, string>();
    const occurrenceKeys = new Set<string>();
    const occurrenceRows: Array<{
      storyId: string;
      blockId: string;
      userId: string;
      termId: string;
      entityId: string;
      entityType: 'character' | 'location';
      text: string;
      color?: string;
      source: ReferenceSource;
      confidence: number;
    }> = [];

    for (const block of params.blocks) {
      const references = [
        ...this.extractReferenceCandidates(block.contentJSON),
        ...this.inferReferenceCandidatesFromText(block.content, {
          characters: characters as CharacterReferenceEntity[],
          locations: locations as LocationReferenceEntity[],
        }),
      ];

      const strongestByBlockTerm = new Map<string, ReferenceCandidate>();
      for (const reference of references) {
        const normalizedText = this.normalizeReferenceText(reference.text);
        if (!normalizedText) continue;

        const blockTermKey = [
          block.id,
          reference.entityType,
          reference.entityId,
          normalizedText,
        ].join(':');

        const existing = strongestByBlockTerm.get(blockTermKey);
        if (!existing || this.referencePriority(reference) > this.referencePriority(existing)) {
          strongestByBlockTerm.set(blockTermKey, reference);
        }
      }

      for (const reference of strongestByBlockTerm.values()) {
        const normalizedText = this.normalizeReferenceText(reference.text);
        if (!normalizedText) continue;

        const termKey = [
          reference.entityType,
          reference.entityId,
          normalizedText,
        ].join(':');

        let termId = termCache.get(termKey);
        if (!termId) {
          const term = await tx.referenceTerm.upsert({
            where: {
              storyId_entityId_entityType_normalizedText: {
                storyId: params.storyId,
                entityId: reference.entityId,
                entityType: reference.entityType,
                normalizedText,
              },
            },
            create: {
              storyId: params.storyId,
              userId: params.userId,
              entityId: reference.entityId,
              entityType: reference.entityType,
              text: reference.text,
              normalizedText,
              color: reference.color,
            },
            update: {
              text: reference.text,
              color: reference.color,
            },
            select: { id: true },
          });
          termId = term.id;
          termCache.set(termKey, term.id);
        }

        if (!termId) {
          continue;
        }

        const occurrenceKey = `${block.id}:${termId}`;
        if (occurrenceKeys.has(occurrenceKey)) continue;
        occurrenceKeys.add(occurrenceKey);

        occurrenceRows.push({
          storyId: params.storyId,
          blockId: block.id,
          userId: params.userId,
          termId,
          entityId: reference.entityId,
          entityType: reference.entityType,
          text: reference.text,
          color: reference.color,
          source: reference.source,
          confidence: reference.confidence,
        });
      }
    }

    if (occurrenceRows.length > 0) {
      await tx.referenceOccurrence.createMany({
        data: occurrenceRows,
      });
    }

    await tx.referenceTerm.deleteMany({
      where: {
        storyId: params.storyId,
        occurrences: { none: {} },
      },
    });
  }

  private extractNodeText(node: StoryDocumentNode): string {
    if (node.type === 'text') {
      return typeof node.text === 'string' ? node.text : '';
    }

    if (node.type === 'hardBreak') {
      return '\n';
    }

    if (node.type === 'chapter') {
      const title = (node.attrs as { title?: unknown } | undefined)?.title;
      return typeof title === 'string' ? `${title}\n` : '';
    }

    const children = Array.isArray(node.content) ? (node.content as StoryDocumentNode[]) : [];
    return children.map((child) => this.extractNodeText(child)).join('');
  }

  private extractDocumentText(document: StoryDocument): string {
    const nodes = Array.isArray(document.content) ? document.content : [];

    return nodes
      .map((node) => this.extractNodeText(node).trimEnd())
      .filter((value) => value.length > 0)
      .join('\n\n');
  }

  private splitStoryDocument(document: Record<string, unknown> | undefined, fallbackContent?: string) {
    const normalizedDocument: StoryDocument =
      document && document.type === 'doc'
        ? (document as StoryDocument)
        : {
            type: 'doc',
            content: fallbackContent
              ? [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: fallbackContent }],
                  },
                ]
              : [],
          };

    const nodes = Array.isArray(normalizedDocument.content)
      ? (normalizedDocument.content as StoryDocumentNode[])
      : [];

    if (nodes.length === 0) {
      return [] as Array<{
        type: string;
        content: string;
        contentJSON: Record<string, unknown>;
        order: number;
        hash: string;
      }>;
    }

    const groups: StoryDocumentNode[][] = [];

    // Keep chapter headings as their own block while preserving scene-level granularity
    // for the prose that follows. This avoids collapsing an entire story into one block
    // when a single chapter node exists.
    for (const node of nodes) {
      if (node.type === 'chapter') {
        groups.push([node]);
        continue;
      }

      groups.push([node]);
    }

    return groups
      .map((group, index) => {
        const contentJSON = { type: 'doc', content: group } as Record<string, unknown>;
        const content = this.extractDocumentText(contentJSON as StoryDocument);

        if (!content.trim()) {
          return null;
        }

        return {
          type: group[0]?.type === 'chapter' ? 'chapter' : 'scene',
          content,
          contentJSON,
          order: index + 1,
          hash: hashBlockContent(content),
        };
      })
      .filter(
        (
          block,
        ): block is {
          type: string;
          content: string;
          contentJSON: Record<string, unknown>;
          order: number;
          hash: string;
        } => block !== null,
      );
  }

  private combineStoryDocument(blocks: Array<{ content: string; contentJSON: unknown; passageId?: string | null }>) {
    const combinedContent: StoryDocumentNode[] = [];
    const combinedText: string[] = [];
    let previousPassageId: string | null = null;

    for (const block of blocks) {
      const currentPassageId = block.passageId ?? null;

      if (
        previousPassageId &&
        currentPassageId &&
        previousPassageId !== currentPassageId
      ) {
        combinedContent.push({ type: 'horizontalRule' });
      }

      const blockDoc = block.contentJSON as StoryDocument | null;
      const nodes = Array.isArray(blockDoc?.content) ? (blockDoc.content as StoryDocumentNode[]) : [];

      if (nodes.length > 0) {
        combinedContent.push(...nodes);
      }

      if (typeof block.content === 'string' && block.content.trim().length > 0) {
        combinedText.push(block.content.trim());
      }

      previousPassageId = currentPassageId;
    }

    return {
      content: combinedText.join('\n\n'),
      contentJSON: { type: 'doc', content: combinedContent },
    };
  }

  private async assertOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: { user: { select: { subscriptionStatus: true } } },
    });

    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();

    return story;
  }

  private async getBlocksForStory(storyId: string) {
    return this.prisma.block.findMany({
      where: { storyId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        passageId: true,
        type: true,
        content: true,
        contentJSON: true,
        order: true,
        status: true,
        hash: true,
        passage: {
          select: {
            id: true,
            order: true,
            visible: true,
          },
        },
      },
    });
  }

  private async getPassagesForStory(storyId: string) {
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

  private formatStoryWithContent(
    story: Awaited<ReturnType<StoriesService['assertOwnership']>>,
    blocks: Awaited<ReturnType<StoriesService['getBlocksForStory']>>,
    passages: Awaited<ReturnType<StoriesService['getPassagesForStory']>>,
  ) {
    const hasPassages = passages.length > 0;
    const visiblePassageIds = new Set(passages.filter((passage) => passage.visible).map((passage) => passage.id));

    const visibleBlocks = hasPassages
      ? blocks.filter((block) => !block.passageId || visiblePassageIds.has(block.passageId))
      : blocks;

    const passageOrder = new Map(passages.map((passage) => [passage.id, passage.order]));
    const sortedVisibleBlocks = visibleBlocks.sort((a, b) => {
      const leftPassageOrder = a.passageId ? passageOrder.get(a.passageId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const rightPassageOrder = b.passageId ? passageOrder.get(b.passageId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;

      if (leftPassageOrder !== rightPassageOrder) {
        return leftPassageOrder - rightPassageOrder;
      }

      return a.order - b.order;
    });

    const combined = this.combineStoryDocument(sortedVisibleBlocks);

    return {
      id: story.id,
      userId: story.userId,
      title: story.title,
      onboardingComplete: story.onboardingComplete,
      wordCount: story.wordCount,
      lastEditedAt: story.lastEditedAt,
      createdAt: story.createdAt,
      subscriptionStatus: story.user.subscriptionStatus,
      content: combined.content,
      contentJSON: combined.contentJSON,
      passages,
    };
  }

  async listForUser(userId: string) {
    return this.prisma.story.findMany({
      where: { userId },
      orderBy: { lastEditedAt: 'desc' },
    });
  }

  async create(userId: string, title = 'Untitled', penName?: string) {
    const story = await this.prisma.story.create({
      data: { userId, title, ...(penName !== undefined ? { penName } : {}) },
    });

    await this.prisma.passage.create({
      data: {
        storyId: story.id,
        title: 'Passage 1',
        order: 1,
        visible: true,
      },
    });

    return story;
  }

  async findById(storyId: string, userId: string) {
    const story = await this.assertOwnership(storyId, userId);
    const [blocks, passages] = await Promise.all([
      this.getBlocksForStory(storyId),
      this.getPassagesForStory(storyId),
    ]);
    return this.formatStoryWithContent(story, blocks, passages);
  }

  async update(
    storyId: string,
    userId: string,
    data: { title?: string; penName?: string; content?: string; contentJSON?: Record<string, unknown>; wordCount?: number },
  ) {
    const story = await this.assertOwnership(storyId, userId);
    const hasBlockPayload = data.content !== undefined || data.contentJSON !== undefined;
    const nextBlocks = hasBlockPayload
      ? this.splitStoryDocument(data.contentJSON, data.content)
      : [];

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const persistedBlocks: Array<{ id: string; content: string; contentJSON: Record<string, unknown> }> = [];

          await tx.story.update({
            where: { id: storyId },
            data: {
              ...(data.title !== undefined ? { title: data.title } : {}),
              ...(data.penName !== undefined ? { penName: data.penName } : {}),
              ...(data.wordCount !== undefined ? { wordCount: data.wordCount } : {}),
              lastEditedAt: new Date(),
            },
          });

          if (!hasBlockPayload) {
            return;
          }

          const existingBlocks = await tx.block.findMany({
            where: { storyId },
            orderBy: { order: 'asc' },
            select: {
              id: true,
              hash: true,
              status: true,
              passageId: true,
              analysisSkipped: true,
              lastAnalyzedAt: true,
            },
          });

          const lastVisiblePassage = await tx.passage.findFirst({
            where: { storyId, visible: true },
            orderBy: { order: 'desc' },
            select: { id: true },
          });

          for (let index = 0; index < nextBlocks.length; index += 1) {
            const nextBlock = nextBlocks[index];
            const existingBlock = existingBlocks[index];

            if (existingBlock) {
              const updatedBlock = await tx.block.update({
                where: { id: existingBlock.id },
                data: {
                  type: nextBlock.type,
                  content: nextBlock.content,
                  contentJSON: nextBlock.contentJSON as object,
                  order: nextBlock.order,
                  hash: nextBlock.hash,
                  status: existingBlock.hash === nextBlock.hash ? existingBlock.status : 'pending',
                  ...(existingBlock.hash === nextBlock.hash
                    ? {}
                    : {
                        analyzedContentHash: null,
                        analysisResult: null,
                        lastAnalyzedAt: existingBlock.analysisSkipped ? null : existingBlock.lastAnalyzedAt,
                        analysisSkipped: false,
                        analysisFailCount: 0,
                      }),
                },
              });
              persistedBlocks.push({
                id: updatedBlock.id,
                content: nextBlock.content,
                contentJSON: nextBlock.contentJSON,
              });
              continue;
            }

            const createdBlock = await tx.block.create({
              data: {
                storyId,
                passageId: lastVisiblePassage?.id,
                type: nextBlock.type,
                content: nextBlock.content,
                contentJSON: nextBlock.contentJSON as object,
                order: nextBlock.order,
                hash: nextBlock.hash,
                analyzedContentHash: null,
                analysisResult: null,
                lastAnalyzedAt: null,
                analysisSkipped: false,
                analysisFailCount: 0,
                status: 'pending',
              },
            });
            persistedBlocks.push({
              id: createdBlock.id,
              content: nextBlock.content,
              contentJSON: nextBlock.contentJSON,
            });
          }

          const extraBlockIds = existingBlocks.slice(nextBlocks.length).map((block) => block.id);
          if (extraBlockIds.length > 0) {
            await tx.block.deleteMany({ where: { id: { in: extraBlockIds } } });
          }

          await this.syncReferencesForBlocks(tx, {
            storyId,
            userId,
            blocks: persistedBlocks,
          });
        }, { timeout: 20000, maxWait: 5000 });

        break;
      } catch (error) {
        if (!this.isRetryableTransactionError(error) || attempt === maxAttempts) {
          throw error;
        }
      }
    }

    const updatedStory = await this.assertOwnership(storyId, userId);
    const [updatedBlocks, passages] = await Promise.all([
      this.getBlocksForStory(storyId),
      this.getPassagesForStory(storyId),
    ]);
    return this.formatStoryWithContent(updatedStory, updatedBlocks, passages);
  }

  async updatePassageContent(
    storyId: string,
    userId: string,
    passageId: string,
    data: { content?: string; contentJSON?: Record<string, unknown>; wordCount?: number },
  ) {
    await this.assertOwnership(storyId, userId);

    const passage = await this.prisma.passage.findUnique({
      where: { id: passageId },
      select: { id: true, storyId: true },
    });

    if (!passage || passage.storyId !== storyId) {
      throw new NotFoundException('Passage not found');
    }

    const hasBlockPayload = data.content !== undefined || data.contentJSON !== undefined;
    const nextBlocks = hasBlockPayload
      ? this.splitStoryDocument(data.contentJSON, data.content)
      : [];

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const persistedBlocks: Array<{ id: string; content: string; contentJSON: Record<string, unknown> }> = [];

          await tx.story.update({
            where: { id: storyId },
            data: {
              ...(data.wordCount !== undefined ? { wordCount: data.wordCount } : {}),
              lastEditedAt: new Date(),
            },
          });

          if (!hasBlockPayload) {
            return;
          }

          const existingBlocks = await tx.block.findMany({
            where: { storyId, passageId },
            orderBy: { order: 'asc' },
            select: {
              id: true,
              hash: true,
              status: true,
              analysisSkipped: true,
              lastAnalyzedAt: true,
            },
          });

          for (let index = 0; index < nextBlocks.length; index += 1) {
            const nextBlock = nextBlocks[index];
            const existingBlock = existingBlocks[index];

            if (existingBlock) {
              const updatedBlock = await tx.block.update({
                where: { id: existingBlock.id },
                data: {
                  type: nextBlock.type,
                  content: nextBlock.content,
                  contentJSON: nextBlock.contentJSON as object,
                  order: nextBlock.order,
                  hash: nextBlock.hash,
                  status: existingBlock.hash === nextBlock.hash ? existingBlock.status : 'pending',
                  ...(existingBlock.hash === nextBlock.hash
                    ? {}
                    : {
                        analyzedContentHash: null,
                        analysisResult: null,
                        lastAnalyzedAt: existingBlock.analysisSkipped ? null : existingBlock.lastAnalyzedAt,
                        analysisSkipped: false,
                        analysisFailCount: 0,
                      }),
                },
              });

              persistedBlocks.push({
                id: updatedBlock.id,
                content: nextBlock.content,
                contentJSON: nextBlock.contentJSON,
              });
              continue;
            }

            const createdBlock = await tx.block.create({
              data: {
                storyId,
                passageId,
                type: nextBlock.type,
                content: nextBlock.content,
                contentJSON: nextBlock.contentJSON as object,
                order: nextBlock.order,
                hash: nextBlock.hash,
                analyzedContentHash: null,
                analysisResult: null,
                lastAnalyzedAt: null,
                analysisSkipped: false,
                analysisFailCount: 0,
                status: 'pending',
              },
            });

            persistedBlocks.push({
              id: createdBlock.id,
              content: nextBlock.content,
              contentJSON: nextBlock.contentJSON,
            });
          }

          const extraBlockIds = existingBlocks.slice(nextBlocks.length).map((block) => block.id);
          if (extraBlockIds.length > 0) {
            await tx.block.deleteMany({ where: { id: { in: extraBlockIds } } });
          }

          await this.syncReferencesForBlocks(tx, {
            storyId,
            userId,
            blocks: persistedBlocks,
            replaceBlockIds: existingBlocks.map((block) => block.id),
          });
        }, { timeout: 20000, maxWait: 5000 });

        break;
      } catch (error) {
        if (!this.isRetryableTransactionError(error) || attempt === maxAttempts) {
          throw error;
        }
      }
    }

    return this.passagesService.recomputeMetadata(passageId);
  }

  async delete(storyId: string, userId: string) {
    await this.assertOwnership(storyId, userId);
    return this.prisma.story.delete({ where: { id: storyId } });
  }

  async getBlocks(storyId: string, userId: string) {
    await this.assertOwnership(storyId, userId);
    const [blocks, occurrences] = await Promise.all([
      this.prisma.block.findMany({
        where: { storyId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          passageId: true,
          storyId: true,
          type: true,
          content: true,
          contentJSON: true,
          order: true,
          status: true,
          hash: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.referenceOccurrence.findMany({
        where: { storyId },
        select: {
          blockId: true,
          source: true,
        },
      }),
    ]);

    const countsByBlock = new Map<string, { total: number; explicit: number; inferred: number }>();
    for (const occurrence of occurrences) {
      const current = countsByBlock.get(occurrence.blockId) ?? {
        total: 0,
        explicit: 0,
        inferred: 0,
      };
      current.total += 1;
      if (occurrence.source === 'explicit') {
        current.explicit += 1;
      } else {
        current.inferred += 1;
      }
      countsByBlock.set(occurrence.blockId, current);
    }

    return blocks.map((block) => {
      const counts = countsByBlock.get(block.id) ?? { total: 0, explicit: 0, inferred: 0 };

      return {
        id: block.id,
        passageId: block.passageId,
        storyId: block.storyId,
        type: block.type,
        content: block.content,
        contentJSON: block.contentJSON,
        order: block.order,
        status: block.status,
        hash: block.hash,
        createdAt: block.createdAt,
        updatedAt: block.updatedAt,
        referenceCount: counts.total,
        explicitReferenceCount: counts.explicit,
        inferredReferenceCount: counts.inferred,
      };
    });
  }

  async getReferences(storyId: string, userId: string) {
    await this.assertOwnership(storyId, userId);

    return this.prisma.referenceTerm.findMany({
      where: { storyId },
      orderBy: [{ entityType: 'asc' }, { text: 'asc' }],
      select: {
        id: true,
        entityId: true,
        entityType: true,
        text: true,
        normalizedText: true,
        color: true,
        createdAt: true,
        updatedAt: true,
        occurrences: {
          select: {
            id: true,
            blockId: true,
            text: true,
            color: true,
            source: true,
            confidence: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async rebuildReferences(storyId?: string) {
    const stories = await this.prisma.story.findMany({
      where: storyId ? { id: storyId } : undefined,
      select: {
        id: true,
        userId: true,
      },
    });

    const summaries: Array<{
      storyId: string;
      referenceTerms: number;
      referenceOccurrences: number;
    }> = [];

    for (const story of stories) {
      const blocks = await this.prisma.block.findMany({
        where: { storyId: story.id },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          content: true,
          contentJSON: true,
        },
      });

      await this.prisma.$transaction(async (tx) => {
        await this.syncReferencesForBlocks(tx, {
          storyId: story.id,
          userId: story.userId,
          blocks: blocks.map((block) => ({
            id: block.id,
            content: block.content,
            contentJSON:
              block.contentJSON && typeof block.contentJSON === 'object'
                ? (block.contentJSON as Record<string, unknown>)
                : { type: 'doc', content: [] },
          })),
        });
        }, { timeout: 20000, maxWait: 5000 });

      const [referenceTerms, referenceOccurrences] = await Promise.all([
        this.prisma.referenceTerm.count({ where: { storyId: story.id } }),
        this.prisma.referenceOccurrence.count({ where: { storyId: story.id } }),
      ]);

      summaries.push({
        storyId: story.id,
        referenceTerms,
        referenceOccurrences,
      });
    }

    return {
      processedStories: summaries.length,
      totals: {
        referenceTerms: summaries.reduce((sum, item) => sum + item.referenceTerms, 0),
        referenceOccurrences: summaries.reduce((sum, item) => sum + item.referenceOccurrences, 0),
      },
      summaries,
    };
  }

  async refreshReferencesForStory(storyId: string, userId: string) {
    await this.assertOwnership(storyId, userId);

    const [blocks, passages] = await Promise.all([
      this.prisma.block.findMany({
        where: { storyId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          content: true,
          contentJSON: true,
        },
      }),
      this.prisma.passage.findMany({
        where: { storyId },
        select: { id: true },
      }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await this.syncReferencesForBlocks(tx, {
        storyId,
        userId,
        blocks: blocks.map((block) => ({
          id: block.id,
          content: block.content,
          contentJSON:
            block.contentJSON && typeof block.contentJSON === 'object'
              ? (block.contentJSON as Record<string, unknown>)
              : { type: 'doc', content: [] },
        })),
      });
    }, { timeout: 20000, maxWait: 5000 });

    await Promise.all(passages.map((passage) => this.passagesService.recomputeMetadata(passage.id)));

    const [referenceTerms, referenceOccurrences] = await Promise.all([
      this.prisma.referenceTerm.count({ where: { storyId } }),
      this.prisma.referenceOccurrence.count({ where: { storyId } }),
    ]);

    return {
      storyId,
      referenceTerms,
      referenceOccurrences,
    };
  }
}
