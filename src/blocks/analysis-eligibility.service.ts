import { Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import {
    getTierPolicy,
    resolveTierFromSubscription,
    type OfferTier,
} from '../payments/offers'
import { normalizeBlockContentForHash } from './block-content-hash'

type EligibilityResult =
  | { decision: 'queue'; tier: OfferTier }
  | { decision: 'skip'; tier: OfferTier; reason: 'minimum_content' | 'unchanged_content' | 'project_cap' | 'no_entity_match' }
  | { decision: 'hold'; tier: OfferTier; reason: 'hold_period'; eligibleAt: Date };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsNormalizedTerm(text: string, term: string): boolean {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return false;

  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(normalizedTerm)}($|[^\\p{L}\\p{N}_])`, 'iu');
  return pattern.test(text);
}

@Injectable()
export class AnalysisEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  private async hasWorldBibleEntityMatch(storyId: string, content: string): Promise<boolean> {
    const [characters, locations] = await Promise.all([
      this.prisma.character.findMany({
        where: { storyId },
        select: { name: true, aliases: true },
      }),
      this.prisma.location.findMany({
        where: { storyId },
        select: { name: true },
      }),
    ]);

    const terms = new Set<string>();

    for (const character of characters) {
      terms.add(character.name);

      for (const alias of (character.aliases ?? []) as Array<string | { text?: string; label?: string; name?: string }>) {
        if (typeof alias === 'string') {
          terms.add(alias);
          continue;
        }

        if (typeof alias?.text === 'string') terms.add(alias.text);
        if (typeof alias?.label === 'string') terms.add(alias.label);
        if (typeof alias?.name === 'string') terms.add(alias.name);
      }
    }

    for (const location of locations) {
      terms.add(location.name);
    }

    const normalizedTerms = [...terms].map((term) => term.trim()).filter(Boolean);
    if (normalizedTerms.length === 0) {
      return true;
    }

    return normalizedTerms.some((term) => containsNormalizedTerm(content, term));
  }

  async evaluate(blockId: string, userId: string): Promise<EligibilityResult> {
    const block = await this.prisma.block.findUnique({
      where: { id: blockId },
      include: {
        story: {
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                subscriptionStatus: true,
                subscriptionOfferId: true,
              },
            },
          },
        },
      },
    });

    if (!block || block.story.userId !== userId) {
      throw new Error('Block ownership must be checked before eligibility evaluation');
    }

    const tier = resolveTierFromSubscription(block.story.user);
    const policy = getTierPolicy(tier);
    const normalizedContent = normalizeBlockContentForHash(block.content);

    if (normalizedContent.length < 40) {
      return { decision: 'skip', tier, reason: 'minimum_content' };
    }

    if (block.analyzedContentHash && block.analyzedContentHash === block.hash) {
      return { decision: 'skip', tier, reason: 'unchanged_content' };
    }

    const holdHours = policy.initialHoldPeriod ?? 0;
    const eligibleAt = new Date(block.createdAt.getTime() + holdHours * 60 * 60 * 1000);
    if (holdHours > 0 && eligibleAt.getTime() > Date.now()) {
      return { decision: 'hold', tier, reason: 'hold_period', eligibleAt };
    }

    const projectCap = policy.maxBlocksAnalyzed;
    if (projectCap !== undefined && projectCap !== 'unlimited') {
      const analyzedBlockCount = await this.prisma.block.count({
        where: {
          storyId: block.storyId,
          lastAnalyzedAt: { not: null },
          analysisSkipped: false,
        },
      });

      const alreadyCounted = block.lastAnalyzedAt !== null && block.analysisSkipped === false;
      if (analyzedBlockCount >= projectCap && !alreadyCounted) {
        return { decision: 'skip', tier, reason: 'project_cap' };
      }
    }

    const hasEntityMatch = await this.hasWorldBibleEntityMatch(block.storyId, block.content);
    if (!hasEntityMatch) {
      return { decision: 'skip', tier, reason: 'no_entity_match' };
    }

    return { decision: 'queue', tier };
  }
}
