import { ProgressGateway } from "@/modules/gateway/progress.gateway";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { ScenesService } from "../scenes/scenes.service";
import { UpdateSceneContentDto } from "./stories.dto";
import setup from "./setup.json";

type StoryDocumentNode = Record<string, unknown>;
type StoryDocument = { type?: unknown; content?: StoryDocumentNode[] };
type StoryMode = "novel" | "screenplay";

const DEFAULT_STORY_MODE: StoryMode = "novel";

type ReferenceSource = "explicit" | "inferred";

type ReferenceCandidate = {
  entityId: string;
  entityType: "character" | "location";
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
  superObjective?: string;
  coreFear?: string;
  mentionType: string;
};

type MentionReferenceEntity = CharacterReferenceEntity;

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scenesService: ScenesService,
    private readonly progressGateway: ProgressGateway,
  ) {}

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2034"
    );
  }

  private referencePriority(
    candidate: Pick<ReferenceCandidate, "source" | "confidence">,
  ): number {
    if (candidate.source === "explicit") {
      return 10 + candidate.confidence;
    }

    return candidate.confidence;
  }

  private normalizeReferenceText(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private extractAliasValues(aliases: unknown[]): string[] {
    return aliases
      .map((alias) => {
        if (typeof alias === "string") {
          return alias;
        }

        if (alias && typeof alias === "object") {
          const label = (alias as { label?: unknown }).label;
          if (typeof label === "string") {
            return label;
          }

          const name = (alias as { name?: unknown }).name;
          if (typeof name === "string") {
            return name;
          }
        }

        return "";
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

  private extractReferenceCandidates(
    contentJSON: Record<string, unknown>,
  ): ReferenceCandidate[] {
    const results: ReferenceCandidate[] = [];

    const pushReference = (
      type: "character" | "location",
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
        source: "explicit",
        confidence: 1,
      });
    };

    const walk = (node: StoryDocumentNode) => {
      const nodeText = typeof node.text === "string" ? node.text : "";

      if (
        node.type === "characterReference" ||
        node.type === "characterRef" ||
        node.type === "mention"
      ) {
        pushReference(
          "character",
          node.attrs as
            | { id?: string; label?: string; color?: string }
            | undefined,
          nodeText,
        );
      }

      if (node.type === "locationReference" || node.type === "locationRef") {
        pushReference(
          "location",
          node.attrs as
            | { id?: string; label?: string; color?: string }
            | undefined,
          nodeText,
        );
      }

      const marks = Array.isArray(node.marks)
        ? (node.marks as StoryDocumentNode[])
        : [];
      marks.forEach((mark) => {
        if (
          mark.type === "characterReference" ||
          mark.type === "characterRef" ||
          mark.type === "mention"
        ) {
          pushReference(
            "character",
            mark.attrs as
              | { id?: string; label?: string; color?: string }
              | undefined,
            nodeText,
          );
        }

        if (mark.type === "locationReference" || mark.type === "locationRef") {
          pushReference(
            "location",
            mark.attrs as
              | { id?: string; label?: string; color?: string }
              | undefined,
            nodeText,
          );
        }
      });

      const children = Array.isArray(node.content)
        ? (node.content as StoryDocumentNode[])
        : [];
      children.forEach(walk);
    };

    walk(contentJSON);
    return results;
  }

  private inferReferenceCandidatesFromText(
    content: string,
    mentions: MentionReferenceEntity[],
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

      const pattern = new RegExp(
        `\\b${this.escapeRegExp(candidate.text)}\\b`,
        "i",
      );
      if (!pattern.test(text)) {
        return;
      }

      matchedKeys.add(key);
      results.push(candidate);
    };

    for (const mention of mentions) {
      const aliases = this.extractAliasValues(
        Array.isArray(mention.aliases) ? mention.aliases : [],
      );
      const isPersonType = mention.mentionType === "person";
      const nameParts = isPersonType
        ? this.deriveCharacterNameParts(mention.name)
        : [];
      const labelEntries = [
        { text: mention.name, confidence: 0.86 },
        ...aliases.map((text) => ({ text, confidence: 0.78 })),
        ...nameParts.map((text) => ({ text, confidence: 0.68 })),
      ];

      const uniqueLabelEntries = new Map<
        string,
        { text: string; confidence: number }
      >();
      for (const entry of labelEntries) {
        const normalized = entry.text.trim();
        if (!normalized) continue;

        const existing = uniqueLabelEntries.get(normalized);
        if (!existing || entry.confidence > existing.confidence) {
          uniqueLabelEntries.set(normalized, {
            text: normalized,
            confidence: entry.confidence,
          });
        }
      }

      for (const { text: trimmed, confidence } of uniqueLabelEntries.values()) {
        if (trimmed.length < 2) continue;

        maybePush({
          entityId: mention.id,
          entityType: mention.mentionType as "character" | "location",
          text: trimmed,
          color: mention.color,
          source: "inferred",
          confidence,
        });
      }
    }

    return results;
  }

  private extractScreenplaySpeakerCandidates(
    contentJSON: Record<string, unknown>,
    mentions: MentionReferenceEntity[],
  ): ReferenceCandidate[] {
    const doc = contentJSON as StoryDocument;
    const nodes = Array.isArray(doc.content) ? doc.content : [];
    if (nodes.length === 0) {
      return [];
    }

    const mentionLabelIndex = new Map<string, MentionReferenceEntity>();
    for (const mention of mentions) {
      const aliases = this.extractAliasValues(
        Array.isArray(mention.aliases) ? mention.aliases : [],
      );
      const labels = [mention.name, ...aliases]
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      for (const label of labels) {
        mentionLabelIndex.set(this.normalizeReferenceText(label), mention);
      }
    }

    const candidates: ReferenceCandidate[] = [];
    for (const node of nodes) {
      if (node.type !== "characterCue" && node.type !== "character") {
        continue;
      }

      const cueText = this.extractNodeText(node).trim();
      if (!cueText) {
        continue;
      }

      const cleanedCueText = cueText
        .replace(/\([^)]*\)/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleanedCueText) {
        continue;
      }

      const matchedMention = mentionLabelIndex.get(
        this.normalizeReferenceText(cleanedCueText),
      );
      if (!matchedMention) {
        continue;
      }

      candidates.push({
        entityId: matchedMention.id,
        entityType: matchedMention.mentionType as "character" | "location",
        text: cleanedCueText,
        color: matchedMention.color,
        source: "inferred",
        confidence: 0.94,
      });
    }

    return candidates;
  }

  private async syncReferencesForBlocks(
    tx: any,
    params: {
      storyId: string;
      userId: string;
      blocks: Array<{
        id: string;
        content: string;
        contentJSON: Record<string, unknown>;
      }>;
      replaceBlockIds?: string[];
    },
  ) {
    const mentions = (await tx.mention.findMany({
      where: {
        storyId: params.storyId,
        userId: params.userId,
        status: "confirmed",
      },
      select: {
        id: true,
        name: true,
        color: true,
        aliases: true,
        mentionType: true,
      },
    })) as MentionReferenceEntity[];

    if (params.replaceBlockIds && params.replaceBlockIds.length > 0) {
      await tx.referenceOccurrence.deleteMany({
        where: {
          storyId: params.storyId,
          blockId: { in: params.replaceBlockIds },
        },
      });
    } else {
      await tx.referenceOccurrence.deleteMany({
        where: { storyId: params.storyId },
      });
    }

    const termCache = new Map<string, string>();
    const occurrenceKeys = new Set<string>();
    const occurrenceRows: Array<{
      storyId: string;
      blockId: string;
      userId: string;
      termId: string;
      entityId: string;
      entityType: "character" | "location";
      text: string;
      color?: string;
      source: ReferenceSource;
      confidence: number;
    }> = [];

    for (const block of params.blocks) {
      const references = [
        ...this.extractReferenceCandidates(block.contentJSON),
        ...this.extractScreenplaySpeakerCandidates(block.contentJSON, mentions),
        ...this.inferReferenceCandidatesFromText(block.content, mentions),
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
        ].join(":");

        const existing = strongestByBlockTerm.get(blockTermKey);
        if (
          !existing ||
          this.referencePriority(reference) > this.referencePriority(existing)
        ) {
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
        ].join(":");

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
    if (node.type === "text") {
      return typeof node.text === "string" ? node.text : "";
    }

    if (node.type === "hardBreak") {
      return "\n";
    }

    if (node.type === "chapter") {
      const title = (node.attrs as { title?: unknown } | undefined)?.title;
      return typeof title === "string" ? `${title}\n` : "";
    }

    const children = Array.isArray(node.content)
      ? (node.content as StoryDocumentNode[])
      : [];
    return children.map((child) => this.extractNodeText(child)).join("");
  }

  private extractDocumentText(document: StoryDocument): string {
    const nodes = Array.isArray(document.content) ? document.content : [];

    return nodes
      .map((node) => this.extractNodeText(node).trimEnd())
      .filter((value) => value.length > 0)
      .join("\n\n");
  }

  private resolveStoryMode(mode: unknown): StoryMode {
    return mode === "screenplay" ? "screenplay" : DEFAULT_STORY_MODE;
  }

  private isNodeType(node: StoryDocumentNode, type: string): boolean {
    return node.type === type;
  }

  private splitScreenplayNodes(
    nodes: StoryDocumentNode[],
  ): StoryDocumentNode[][] {
    const groups: StoryDocumentNode[][] = [];
    let pendingTurn: StoryDocumentNode[] = [];

    const flushPendingTurn = () => {
      if (pendingTurn.length === 0) return;
      groups.push([...pendingTurn]);
      pendingTurn = [];
    };

    const isCharacterNode = (type: string | undefined) =>
      type === "characterCue" || type === "character";

    const isTurnContinueType = (type: string | undefined) =>
      type === "parenthetical" || type === "dialogue";

    const isTurnEndType = (type: string | undefined) =>
      type === "dialogue" || type === "parenthetical";

    for (const node of nodes) {
      const type = typeof node.type === "string" ? node.type : undefined;

      if (
        this.isNodeType(node, "sceneHeading") ||
        this.isNodeType(node, "transition") ||
        this.isNodeType(node, "action")
      ) {
        flushPendingTurn();
        groups.push([node]);
        continue;
      }

      if (isCharacterNode(type)) {
        flushPendingTurn();
        pendingTurn = [node];
        continue;
      }

      if (
        pendingTurn.length > 0 &&
        isCharacterNode(
          typeof pendingTurn[0].type === "string" ? pendingTurn[0].type : undefined,
        ) &&
        isTurnContinueType(type)
      ) {
        pendingTurn.push(node);
        if (isTurnEndType(type)) {
          flushPendingTurn();
        }
        continue;
      }

      flushPendingTurn();
      groups.push([node]);
    }

    flushPendingTurn();
    return groups;
  }

  private inferBlockTypeForGroup(
    group: StoryDocumentNode[],
    mode: StoryMode,
  ): string {
    const firstType = typeof group[0]?.type === "string" ? group[0].type : "";
    if (mode !== "screenplay") {
      return firstType === "chapter" ? "chapter" : "scene";
    }

    if (firstType === "sceneHeading") {
      return "screenplay_scene_heading";
    }

    if (
      firstType === "characterCue" ||
      firstType === "character" ||
      firstType === "parenthetical" ||
      firstType === "dialogue"
    ) {
      return "screenplay_turn";
    }

    if (firstType === "action") {
      return "screenplay_action";
    }

    if (firstType === "transition") {
      return "screenplay_transition";
    }

    return "screenplay_misc";
  }

  private splitStoryDocument(
    document: Record<string, unknown> | undefined,
    fallbackContent?: string,
    mode: StoryMode = DEFAULT_STORY_MODE,
  ) {
    const normalizedDocument: StoryDocument =
      document && document.type === "doc"
        ? (document as StoryDocument)
        : {
            type: "doc",
            content: fallbackContent
              ? [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: fallbackContent }],
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

    const groups: StoryDocumentNode[][] =
      mode === "screenplay"
        ? this.splitScreenplayNodes(nodes)
        : // Keep chapter headings as their own block while preserving scene-level granularity
          // for the prose that follows. This avoids collapsing an entire story into one block
          // when a single chapter node exists.
          nodes.map((node) => [node]);

    return groups
      .map((group, index) => {
        const contentJSON = { type: "doc", content: group } as Record<
          string,
          unknown
        >;
        const content = this.extractDocumentText(contentJSON as StoryDocument);

        if (!content.trim()) {
          return null;
        }

        return {
          type: this.inferBlockTypeForGroup(group, mode),
          content,
          contentJSON,
          order: index + 1,
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

  private combineStoryDocument(
    blocks: Array<{
      content: string;
      contentJSON: unknown;
      sceneId?: string | null;
    }>,
  ) {
    const combinedContent: StoryDocumentNode[] = [];
    const combinedText: string[] = [];
    let previousSceneId: string | null = null;

    for (const block of blocks) {
      const currentSceneId = block.sceneId ?? null;

      if (
        previousSceneId &&
        currentSceneId &&
        previousSceneId !== currentSceneId
      ) {
        combinedContent.push({ type: "horizontalRule" });
      }

      const blockDoc = block.contentJSON as StoryDocument | null;
      const nodes = Array.isArray(blockDoc?.content)
        ? (blockDoc.content as StoryDocumentNode[])
        : [];

      if (nodes.length > 0) {
        combinedContent.push(...nodes);
      }

      if (
        typeof block.content === "string" &&
        block.content.trim().length > 0
      ) {
        combinedText.push(block.content.trim());
      }

      previousSceneId = currentSceneId;
    }

    return {
      content: combinedText.join("\n\n"),
      contentJSON: { type: "doc", content: combinedContent },
    };
  }

  private async assertOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: {
        user: {
          select: {
            subscription: {
              select: {
                subscriptionStatus: true,
              },
            },
          },
        },
      },
    });

    if (!story) throw new NotFoundException("Story not found");
    if (story.userId !== userId) throw new ForbiddenException();

    return story;
  }

  private async getBlocksForStory(storyId: string) {
    return [];
  }

  private async getScenesForStory(storyId: string) {
    return this.prisma.scene.findMany({
      where: { storyId },
      orderBy: { order: "asc" },
      include: {
        notes: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.story.findMany({
      where: { userId },
      orderBy: { lastEditedAt: "desc" },
    });
  }

  private generateShortId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  private async createDefaultHighlightColors({ storyId }: { storyId: string }) {
    const createdColors = await this.prisma.highlight.createMany({
      data: setup.highlights.map((highlight) => ({
        storyId,
        ...highlight,
      })),
    });
    return createdColors;
  }

  async create(
    userId: string,
    title = "Untitled",
    penName?: string,
    mode?: StoryMode,
  ) {
    const story = await this.prisma.story.create({
      data: {
        userId,
        title,
        ...(penName !== undefined ? { penName } : {}),
        mode: this.resolveStoryMode(mode),
        settings: {
          sceneDefaults: {
            pov: "first",
            tense: "present",
            perspective: null,
          },
          updatedAt: new Date(),
        },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      const scene = await tx.scene.create({
        data: {
          storyId: story.id,
          label: "Scene 1",
          shortId: this.generateShortId(),
          order: 1,
          visible: true,
          settings: {
            pov: "first",
            tense: "present",
            perspective: null,
          },
        },
      });

      await this.scenesService.createInitialVersion(scene.id, tx);
    });

    return story;
  }

  async findById(storyId: string, userId: string) {
    const story = await this.assertOwnership(storyId, userId);
    const [blocks, scenes] = await Promise.all([
      this.getBlocksForStory(storyId),
      this.getScenesForStory(storyId),
    ]);

    const { content, contentJSON } = this.combineStoryDocument(blocks);

    return {
      id: story.id,
      title: story.title,
      mode: story.mode,
      penName: story.penName,
      wordCount: story.wordCount,
      onboardingComplete: story.onboardingComplete,
      content,
      contentJSON,
      metadata: story.settings?.metadata ?? null,
      subscriptionStatus:
        story.user?.subscription?.subscriptionStatus ?? null,
      scenes: scenes.map((scene) => ({
        id: scene.id,
        shortId: scene.shortId,
        title: scene.label ?? "Untitled Scene",
        order: scene.order,
        visible: scene.visible,
        wordCount: 0,
        color: scene.color ?? "amber",
        threadCount: scene.threadCount,
        mentionCount: scene.mentionCount,
        chapters: [],
        notes: (scene.notes ?? []).map((note) => ({
          id: note.id,
          content: note.body,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
        })),
        mentions: [],
        comments: [],
      })),
    };
  }

  async updateSceneContent(
    storyId: string,
    userId: string,
    sceneId: string,
    dto: UpdateSceneContentDto,
  ) {
    await this.assertOwnership(storyId, userId);

    const scene = await this.prisma.scene.findFirst({
      where: { id: sceneId, storyId },
      select: { id: true },
    });

    if (!scene) {
      throw new NotFoundException("Scene not found");
    }

    const updated = await this.scenesService.updateActiveVersionContent(
      sceneId,
      userId,
      dto,
    );

    if (updated?.activeVersionId) {
      const activeVersion = updated.versions?.find(
        (version) => version.id === updated.activeVersionId,
      );

      this.progressGateway.emitSceneContentUpdated(storyId, {
        sceneId,
        versionId: updated.activeVersionId,
        wordCount: activeVersion?.wordCount ?? dto.wordCount ?? 0,
      });
    }

    return updated;
  }

  async updateMetadata(
    storyId: string,
    userId: string,
    metadata: Record<string, unknown>,
  ) {
    const story = await this.assertOwnership(storyId, userId);
    const currentSettings = story.settings ?? {
      sceneDefaults: {
        pov: "first",
        tense: "present",
        perspective: null,
      },
      updatedAt: new Date(),
    };

    const updatedStory = await this.prisma.story.update({
      where: { id: storyId },
      data: {
        settings: {
          set: {
            sceneDefaults: currentSettings.sceneDefaults ?? {
              pov: "first",
              tense: "present",
              perspective: null,
            },
            metadata: metadata as Prisma.InputJsonValue,
            updatedAt: new Date(),
          },
        },
      },
    });

    return {
      id: updatedStory.id,
      metadata: updatedStory.settings?.metadata ?? metadata,
    };
  }

  async delete(storyId: string, userId: string) {
    await this.assertOwnership(storyId, userId);
    return this.prisma.story.delete({ where: { id: storyId } });
  }
}
