import { Injectable, Logger } from '@nestjs/common';
import { ProviderService } from './provider.service';

export interface BlockSummary {
  id: string;
  content: string;
  order: number;
}

export interface SensoryPresent {
  attendedMoment: string;
  recentContext: string;
  forwardConstraint: string | null;
  focalEntityId: string | null;
  focalEntityName: string | null;
  activeTensions: string[];
  entitiesPresent: Array<{ entityId: string; entityName: string; weightMultiplier: number }>;
  assumptionNote: string | null;
}

interface EntityInfo {
  id: string;
  name: string;
  recentBlockOrder: number;
}

@Injectable()
export class SpConstructorService {
  private readonly logger = new Logger(SpConstructorService.name);

  constructor(private readonly provider: ProviderService) {}

  private parseJsonObjectResponse(raw: string): SensoryPresent {
    const trimmed = raw.trim();
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      return JSON.parse(unfenced) as SensoryPresent;
    } catch {
      const start = unfenced.indexOf('{');
      const end = unfenced.lastIndexOf('}');

      if (start >= 0 && end > start) {
        const sliced = unfenced.slice(start, end + 1);
        return JSON.parse(sliced) as SensoryPresent;
      }

      throw new SyntaxError('AI response is not valid JSON object');
    }
  }

  async build(
    question: string,
    highlightBlock: BlockSummary,
    priorBlocks: BlockSummary[],
    forwardBlocks: BlockSummary[],
    entities: EntityInfo[],
  ): Promise<SensoryPresent> {
    const priorText = priorBlocks.map((b) => b.content).join('\n\n');
    const forwardText = forwardBlocks.map((b) => b.content).join('\n\n');

    const entityList = entities
      .map((e) => `- ${e.name} (id: ${e.id})`)
      .join('\n');

    const systemPrompt = `You are a narrative intelligence engine analyzing a writer's attended moment.
Given the writer's question, the current block they are focused on, context before it, and any prose written ahead, synthesize a sensory present document.

Return ONLY a JSON object with these fields:
- attendedMoment: string (the essence of what is happening right now in the highlighted block)
- recentContext: string (key causal context from prior blocks in 1-2 sentences)
- forwardConstraint: string | null (what the prose ahead commits to, if it exists; null if no forward blocks)
- focalEntityId: string | null (the entity ID most central to the writer's question; null if unclear)
- focalEntityName: string | null
- activeTensions: string[] (2-4 narrative tensions active at this moment)
- entitiesPresent: array of { entityId, entityName, weightMultiplier } where weightMultiplier is 1.0 for entities in the highlight block, 0.4 for entities only in prior/forward blocks
- assumptionNote: string | null (if the question is vague and you defaulted to the most recently active entity, explain; otherwise null)

No markdown, no explanation.`;

    const userPrompt = `Writer's question: ${question || '(no question — surface what matters most)'}

Highlighted block (attended moment):
${highlightBlock.content}

${priorText ? `Prior context:\n${priorText}\n\n` : ''}${forwardText ? `Forward constraint (already written):\n${forwardText}\n\n` : ''}Known entities:
${entityList || '(none tagged yet)'}`;

    try {
      const raw = await this.provider.complete(userPrompt, systemPrompt);
      return this.parseJsonObjectResponse(raw);
    } catch (err) {
      this.logger.error(`SP constructor parse error: ${err}`);
      // Fallback — minimal sensory present
      return {
        attendedMoment: highlightBlock.content.slice(0, 200),
        recentContext: priorText.slice(0, 200),
        forwardConstraint: forwardText ? forwardText.slice(0, 200) : null,
        focalEntityId: null,
        focalEntityName: null,
        activeTensions: [],
        entitiesPresent: [],
        assumptionNote: 'Sensory present construction failed; using fallback.',
      };
    }
  }
}
