import type { PrismaService } from "@/database/prisma.service";
import { DEFAULT_KEY_DETAIL_TEMPLATES } from "./platform.defaults";
import type {
  KeyDetailTemplate,
  MentionType,
  PlatformStoryContext,
} from "./platform.types";
import { normalizeFieldType, parseAliases } from "./platform.utils";

function templatesFromKeyAttributes(
  keyAttributes: { label: string; context: string | null }[],
): KeyDetailTemplate[] {
  if (keyAttributes.length === 0) return [];

  return keyAttributes.map((attr) => ({
    label: attr.label,
    type: "text" as const,
    context: attr.context ?? undefined,
  }));
}

function templatesForType(
  dbTemplates: KeyDetailTemplate[],
  mentionType: MentionType,
): KeyDetailTemplate[] {
  if (dbTemplates.length > 0) {
    return dbTemplates;
  }
  return DEFAULT_KEY_DETAIL_TEMPLATES[mentionType];
}

export async function loadPlatformStoryContext(
  prisma: PrismaService,
  storyId: string,
): Promise<PlatformStoryContext> {
  const [mentions, attributes, keyAttributes, scenes, notes] =
    await Promise.all([
      prisma.mention.findMany({
        where: { storyId },
        orderBy: [{ mentionCount: "desc" }, { createdAt: "asc" }],
      }),
      prisma.attribute.findMany({ where: { storyId } }),
      prisma.keyAttribute.findMany({
        where: { storyId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.scene.findMany({
        where: { storyId, visible: true },
        select: { id: true, label: true, summary: true, shortId: true },
        orderBy: { order: "asc" },
      }),
      prisma.note.findMany({
        where: { storyId },
        select: { id: true, body: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

  const attributesByMention = new Map<string, Record<string, string>>();
  for (const attribute of attributes) {
    const existing = attributesByMention.get(attribute.mentionId) ?? {};
    existing[attribute.label] = attribute.value;
    attributesByMention.set(attribute.mentionId, existing);
  }

  const dbTemplates = templatesFromKeyAttributes(keyAttributes);

  return {
    mentions: mentions.map((mention) => ({
      id: mention.id,
      name: mention.name,
      type: mention.mentionType as MentionType,
      aliases: parseAliases(mention.aliases),
      keyDetails: attributesByMention.get(mention.id) ?? {},
    })),
    keyDetailTemplates: {
      person: templatesForType(dbTemplates, "person"),
      place: templatesForType(dbTemplates, "place"),
      thing: templatesForType(dbTemplates, "thing"),
    },
    scenes: scenes.map((scene) => ({
      id: scene.id,
      label: scene.label,
      summary: scene.summary,
      shortId: scene.shortId,
    })),
    notes: notes.map((note) => ({
      id: note.id,
      preview:
        note.body.length > 120 ? `${note.body.slice(0, 117)}...` : note.body,
    })),
  };
}
