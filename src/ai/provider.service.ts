import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { AppConfigService } from '../common/config/app-config.service';
import { EventsService } from '../events/events.service';
import { EVENT_GROUP, EVENT_TYPE } from '../events/event.constants';
import { estimateCostUsd } from './ai-pricing.constants';

@Injectable()
export class ProviderService {
  private anthropicClient: Anthropic | null = null;
  private openAiClient: OpenAI | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly events: EventsService,
  ) {}

  private getAnthropic(): Anthropic {
    if (!this.anthropicClient) {
      const apiKey = this.config.anthropicApiKey;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
      }
      this.anthropicClient = new Anthropic({ apiKey });
    }
    return this.anthropicClient;
  }

  private getOpenAI(): OpenAI {
    if (!this.openAiClient) {
      const apiKey = this.config.openAiApiKey;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
      }
      this.openAiClient = new OpenAI({ apiKey });
    }
    return this.openAiClient;
  }

  async complete(userPrompt: string, systemPrompt: string): Promise<string> {
    const startMs = Date.now();
    const provider = this.config.aiProvider;

    try {
      if (provider === 'anthropic') {
        const model = 'claude-sonnet-4-20250514';
        const message = await this.getAnthropic().messages.create({
          model,
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });
        const block = message.content[0];
        if (block.type !== 'text') {
          throw new Error('Unexpected Anthropic response type');
        }
        this.events.record({
          eventType: EVENT_TYPE.AI_CALL_COMPLETED,
          eventGroup: EVENT_GROUP.AI,
          source: ProviderService.name,
          status: 'success',
          durationMs: Date.now() - startMs,
          provider,
          model,
          inputUnits: message.usage.input_tokens,
          outputUnits: message.usage.output_tokens,
          estimatedCostUsd: estimateCostUsd(model, message.usage.input_tokens, message.usage.output_tokens),
          metadata: {},
        });
        return block.text;
      }

      const model = 'gpt-4o-mini';
      const completion = await this.getOpenAI().chat.completions.create({
        model,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      this.events.record({
        eventType: EVENT_TYPE.AI_CALL_COMPLETED,
        eventGroup: EVENT_GROUP.AI,
        source: ProviderService.name,
        status: 'success',
        durationMs: Date.now() - startMs,
        provider,
        model,
        inputUnits: completion.usage?.prompt_tokens,
        outputUnits: completion.usage?.completion_tokens,
        estimatedCostUsd: estimateCostUsd(model, completion.usage?.prompt_tokens, completion.usage?.completion_tokens),
        metadata: {},
      });
      return completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      this.events.record({
        eventType: EVENT_TYPE.AI_CALL_FAILED,
        eventGroup: EVENT_GROUP.AI,
        source: ProviderService.name,
        status: 'error',
        durationMs: Date.now() - startMs,
        provider,
        metadata: { error: String(err) },
      });
      throw err;
    }
  }
}
