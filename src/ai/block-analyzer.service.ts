import { Injectable, Logger } from '@nestjs/common';
import { ProviderService } from './provider.service';

export interface CharacterRefMark {
  characterId: string;
  characterName: string;
  isAlias: boolean;
}

export interface LocationRefMark {
  locationId: string;
  locationName: string;
}

interface LegacyMentionAttrs {
  id?: string;
  label?: string;
  characterId?: string;
  characterName?: string;
  isAlias?: boolean;
  locationId?: string;
  locationName?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsNormalizedTerm(text: string, term: string): boolean {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return false;

  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(normalizedTerm)}($|[^\\p{L}\\p{N}_])`, 'iu');
  return pattern.test(text);
}

function inferRefsFromText(
  blockContent: string,
  entityContexts: EntityContext[],
): { characterRefs: CharacterRefMark[]; locationRefs: LocationRefMark[] } {
  const characterRefs: CharacterRefMark[] = [];
  const locationRefs: LocationRefMark[] = [];

  for (const entity of entityContexts) {
    if (entity.type === 'character') {
      if (containsNormalizedTerm(blockContent, entity.name)) {
        characterRefs.push({
          characterId: entity.id,
          characterName: entity.name,
          isAlias: false,
        });
      }

      const aliases = entity.aliases ?? [];
      aliases.forEach((alias) => {
        if (containsNormalizedTerm(blockContent, alias.text)) {
          characterRefs.push({
            characterId: entity.id,
            characterName: alias.text,
            isAlias: true,
          });
        }
      });
      continue;
    }

    if (containsNormalizedTerm(blockContent, entity.name)) {
      locationRefs.push({
        locationId: entity.id,
        locationName: entity.name,
      });
    }
  }

  return { characterRefs, locationRefs };
}

export interface ThreadExtraction {
  entityId: string;
  entityType: 'character' | 'location';
  observation: string;
  interactions: string[];
  emotionalTone: string | null;
  superObjAlign: 'aligned' | 'diverging' | 'contradicts' | null;
  referenceSource?: 'explicit' | 'inferred';
  referenceConfidence?: number;
}

export interface ReferenceOccurrenceInput {
  entityId: string;
  entityType: 'character' | 'location';
  text?: string;
  source: 'explicit' | 'inferred';
  confidence: number;
}

interface EntityContext {
  id: string;
  type: 'character' | 'location';
  name: string;
  superObjective?: string;
  coreFear?: string;
  aliases?: Array<{ text: string; context?: string }>;
}

function extractMarksFromNode(node: Record<string, unknown>): {
  characterRefs: CharacterRefMark[];
  locationRefs: LocationRefMark[];
} {
  const characterRefs: CharacterRefMark[] = [];
  const locationRefs: LocationRefMark[] = [];

  const pushCharacterRef = (attrs: LegacyMentionAttrs | undefined) => {
    const characterId = attrs?.characterId ?? attrs?.id;
    if (!characterId) return;

    characterRefs.push({
      characterId,
      characterName: attrs?.characterName ?? attrs?.label ?? characterId,
      isAlias: attrs?.isAlias ?? false,
    });
  };

  const pushLocationRef = (attrs: LegacyMentionAttrs | undefined) => {
    const locationId = attrs?.locationId ?? attrs?.id;
    if (!locationId) return;

    locationRefs.push({
      locationId,
      locationName: attrs?.locationName ?? attrs?.label ?? locationId,
    });
  };

  if (node.type === 'characterRef' || node.type === 'mention') {
    pushCharacterRef(node.attrs as LegacyMentionAttrs | undefined);
  }

  if (node.type === 'characterReference') {
    pushCharacterRef(node.attrs as LegacyMentionAttrs | undefined);
  }

  if (node.type === 'locationRef') {
    pushLocationRef(node.attrs as LegacyMentionAttrs | undefined);
  }

  if (node.type === 'locationReference') {
    pushLocationRef(node.attrs as LegacyMentionAttrs | undefined);
  }

  const marks = (node.marks ?? []) as Array<Record<string, unknown>>;
  for (const mark of marks) {
    if (mark.type === 'characterRef') {
      pushCharacterRef(mark.attrs as LegacyMentionAttrs | undefined);
    } else if (mark.type === 'mention') {
      pushCharacterRef(mark.attrs as LegacyMentionAttrs | undefined);
    } else if (mark.type === 'characterReference') {
      pushCharacterRef(mark.attrs as LegacyMentionAttrs | undefined);
    } else if (mark.type === 'locationRef') {
      pushLocationRef(mark.attrs as LegacyMentionAttrs | undefined);
    } else if (mark.type === 'locationReference') {
      pushLocationRef(mark.attrs as LegacyMentionAttrs | undefined);
    }
  }

  const content = (node.content ?? []) as Array<Record<string, unknown>>;
  for (const child of content) {
    const nested = extractMarksFromNode(child);
    characterRefs.push(...nested.characterRefs);
    locationRefs.push(...nested.locationRefs);
  }

  return { characterRefs, locationRefs };
}

@Injectable()
export class BlockAnalyzerService {
  private readonly logger = new Logger(BlockAnalyzerService.name);

  constructor(private readonly provider: ProviderService) {}

  private parseJsonArrayResponse(raw: string): ThreadExtraction[] {
    const trimmed = raw.trim();
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      return JSON.parse(unfenced) as ThreadExtraction[];
    } catch {
      const start = unfenced.indexOf('[');
      const end = unfenced.lastIndexOf(']');

      if (start >= 0 && end > start) {
        const sliced = unfenced.slice(start, end + 1);
        return JSON.parse(sliced) as ThreadExtraction[];
      }

      throw new SyntaxError('AI response is not valid JSON array');
    }
  }

  async analyze(
    blockContent: string,
    contentJSON: Record<string, unknown>,
    entityContexts: EntityContext[],
    blockOrder: number,
    occurrenceInputs?: ReferenceOccurrenceInput[],
  ): Promise<ThreadExtraction[]> {
    const explicitRefs = extractMarksFromNode(contentJSON);
    const inferredRefs = inferRefsFromText(blockContent, entityContexts);

    const occurrenceByEntity = new Map<string, ReferenceOccurrenceInput>();
    for (const occurrence of occurrenceInputs ?? []) {
      const key = `${occurrence.entityType}:${occurrence.entityId}`;
      const existing = occurrenceByEntity.get(key);
      const existingPriority = existing ? (existing.source === 'explicit' ? 10 + existing.confidence : existing.confidence) : -1;
      const incomingPriority = occurrence.source === 'explicit' ? 10 + occurrence.confidence : occurrence.confidence;
      if (!existing || incomingPriority > existingPriority) {
        occurrenceByEntity.set(key, occurrence);
      }
    }

    const characterRefs = [...explicitRefs.characterRefs, ...inferredRefs.characterRefs];
    const locationRefs = [...explicitRefs.locationRefs, ...inferredRefs.locationRefs];

    if (characterRefs.length === 0 && locationRefs.length === 0 && occurrenceByEntity.size === 0) {
      this.logger.debug(`No entity refs found in block ${blockOrder}; skipping thread extraction`);
      return [];
    }

    // Deduplicate by entityId
    let uniqueCharacterIds = [...new Set(characterRefs.map((r) => r.characterId))];
    let uniqueLocationIds = [...new Set(locationRefs.map((r) => r.locationId))];

    if (occurrenceByEntity.size > 0) {
      uniqueCharacterIds = [...occurrenceByEntity.values()]
        .filter((item) => item.entityType === 'character')
        .map((item) => item.entityId);
      uniqueLocationIds = [...occurrenceByEntity.values()]
        .filter((item) => item.entityType === 'location')
        .map((item) => item.entityId);
    }

    // Build entity context map
    const entityMap = new Map(entityContexts.map((e) => [e.id, e]));

    // Build alias context notes
    const aliasNotes = characterRefs
      .filter((r) => r.isAlias)
      .map((r) => {
        const entity = entityMap.get(r.characterId);
        const alias = entity?.aliases?.find((a) => a.text === r.characterName);
        if (alias?.context) {
          return `"${r.characterName}" is an alias for ${entity?.name} (context: ${alias.context})`;
        }
        return `"${r.characterName}" is an alias for ${entity?.name ?? r.characterId}`;
      });

    const entityDescriptions = [
      ...uniqueCharacterIds.map((id) => {
        const e = entityMap.get(id);
        if (!e) return `Character ID: ${id}`;
        return [
          `Character "${e.name}" (id: ${id})`,
          e.superObjective ? `  super-objective: ${e.superObjective}` : null,
          e.coreFear ? `  core fear: ${e.coreFear}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      }),
      ...uniqueLocationIds.map((id) => {
        const e = entityMap.get(id);
        return e ? `Location "${e.name}" (id: ${id})` : `Location ID: ${id}`;
      }),
    ].join('\n\n');

    const systemPrompt = `You are a narrative analyst. Given a prose block and tagged entities, extract a thread for each entity.
For each entity, return a JSON object with:
- entityId: string (the exact ID provided)
- entityType: "character" | "location"
- observation: string (what this entity is specifically doing or conveying in THIS block)
- interactions: string[] (IDs of other entities present in this same block)
- emotionalTone: string | null (emotional register for this entity here)
- superObjAlign: "aligned" | "diverging" | "contradicts" | null
  (only for characters: does their behavior in this block align with, diverge from, or contradict their super-objective? null if no super-objective defined)

Return ONLY a JSON array. No markdown, no explanation.`;

    const userPrompt = `Prose block:
${blockContent}

${aliasNotes.length > 0 ? `Alias context:\n${aliasNotes.join('\n')}\n\n` : ''}Entities to analyze:
${entityDescriptions}

All entity IDs present in this block: ${[...uniqueCharacterIds, ...uniqueLocationIds].join(', ')}`;

    try {
      const raw = await this.provider.complete(userPrompt, systemPrompt);
      const parsed = this.parseJsonArrayResponse(raw);
      const explicitEntityKeys = new Set<string>([
        ...explicitRefs.characterRefs.map((ref) => `character:${ref.characterId}`),
        ...explicitRefs.locationRefs.map((ref) => `location:${ref.locationId}`),
      ]);

      const occurrenceFallback = new Map<string, ReferenceOccurrenceInput>();
      for (const extraction of parsed) {
        const key = `${extraction.entityType}:${extraction.entityId}`;
        if (occurrenceByEntity.has(key)) {
          occurrenceFallback.set(key, occurrenceByEntity.get(key)!);
          continue;
        }

        const isExplicit = explicitEntityKeys.has(key);
        occurrenceFallback.set(key, {
          entityId: extraction.entityId,
          entityType: extraction.entityType,
          source: isExplicit ? 'explicit' : 'inferred',
          confidence: isExplicit ? 1 : 0.5,
        });
      }

      return parsed.map((extraction) => {
        const key = `${extraction.entityType}:${extraction.entityId}`;
        const occurrence = occurrenceFallback.get(key);

        return {
          ...extraction,
          referenceSource: occurrence?.source ?? 'inferred',
          referenceConfidence: occurrence?.confidence ?? 0.5,
        };
      });
    } catch (err) {
      this.logger.error(`Block analysis parse error: ${err}`);
      return [];
    }
  }
}
