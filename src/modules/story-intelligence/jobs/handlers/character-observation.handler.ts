import { PrismaService } from '@/database/prisma.service';
import { ProviderService } from '@/modules/ai/provider.service';
import { Injectable, Logger } from '@nestjs/common';
import {
  buildCharacterObservationUserPrompt,
  CHARACTER_OBSERVATION_SYSTEM_PROMPT,
} from '../../prompts/character-observation.prompt';
import type { IntelligenceJobResult } from '../../story-intelligence.types';

interface CharacterObservationAiItem {
  characterName: string;
  mentionId: string | null;
  summary: string;
  emotionalState: string;
  languageNotes: string;
  voiceToneNotes: string;
  relationships: Record<string, string>;
  confidence: number;
}

interface CharacterObservationAiResponse {
  observations: CharacterObservationAiItem[];
}

function extractJson(raw: string): CharacterObservationAiResponse {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(candidate) as CharacterObservationAiResponse;

  if (!Array.isArray(parsed.observations)) {
    throw new Error('Character observation response missing observations array');
  }

  return parsed;
}

@Injectable()
export class CharacterObservationHandler {
  private readonly logger = new Logger(CharacterObservationHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: ProviderService,
  ) {}

  async execute(inputId: string, sceneId?: string): Promise<IntelligenceJobResult> {
    const input = await this.prisma.storyInput.findUnique({ where: { id: inputId } });

    if (!input?.plainText?.trim()) {
      return { upserts: [], diagnostic: 'empty_extraction' };
    }

    const scene = sceneId
      ? await this.prisma.scene.findUnique({
          where: { id: sceneId },
          select: { label: true },
        })
      : null;

    const mentions = await this.prisma.mention.findMany({
      where: { storyId: input.storyId },
      select: { id: true, name: true, mentionType: true },
      orderBy: [{ mentionCount: 'desc' }],
      take: 30,
    });

    const userPrompt = buildCharacterObservationUserPrompt(
      input.plainText,
      scene?.label ?? undefined,
      mentions.map((mention) => ({
        id: mention.id,
        name: mention.name,
        type: mention.mentionType,
      })),
    );

    try {
      const raw = await this.provider.complete(
        userPrompt,
        CHARACTER_OBSERVATION_SYSTEM_PROMPT,
      );
      const parsed = extractJson(raw);

      if (parsed.observations.length === 0) {
        return { upserts: [], diagnostic: 'analyzer_returned_empty' };
      }

      const validMentionIds = new Set(mentions.map((mention) => mention.id));

      const upserts = parsed.observations.flatMap((observation) => {
        const mentionId =
          observation.mentionId && validMentionIds.has(observation.mentionId)
            ? observation.mentionId
            : undefined;

        return [
          {
            op: 'update' as const,
            layer: 'character_arc' as const,
            summary: observation.summary || `${observation.characterName}: ${observation.emotionalState}`,
            body: {
              characterName: observation.characterName,
              mentionId: mentionId ?? null,
              emotionalState: observation.emotionalState,
              languageNotes: observation.languageNotes,
              voiceToneNotes: observation.voiceToneNotes,
              relationships: observation.relationships,
            },
            links: {
              mentionIds: mentionId ? [mentionId] : [],
              sceneIds: sceneId ? [sceneId] : [],
            },
            confidence: observation.confidence,
            canonStatus: input.canonStatus,
          },
        ];
      });

      const filtered = upserts.filter((upsert) => upsert.confidence >= 0.5);

      if (filtered.length === 0) {
        return { upserts: [], diagnostic: 'threads_filtered_by_confidence' };
      }

      return { upserts: filtered };
    } catch (error) {
      this.logger.error('Character observation failed', error);
      return { upserts: [], diagnostic: 'analyzer_failed' };
    }
  }
}
