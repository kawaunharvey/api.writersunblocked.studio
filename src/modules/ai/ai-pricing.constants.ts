/**
 * Published per-token USD pricing for AI models used in this application.
 * Prices are per 1,000 tokens (not per million) for easy mental math.
 *
 * Sources (as of April 2026):
 *   OpenAI  — https://openai.com/api/pricing/
 *   Anthropic — https://www.anthropic.com/pricing#api
 *
 * Update this file whenever pricing changes. estimatedCostUsd stored on AppEvent
 * reflects the prices at the time of the call.
 */

interface ModelPricing {
  /** USD per 1,000 input tokens */
  inputPer1k: number;
  /** USD per 1,000 output tokens */
  outputPer1k: number;
}

/**
 * Pricing table keyed by model identifier as returned by the provider SDK.
 * Add new model entries here when adding new models.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ── OpenAI ────────────────────────────────────────────────────────────────
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'gpt-4o': { inputPer1k: 0.005, outputPer1k: 0.015 },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  'claude-sonnet-4-20250514': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-haiku-3-5': { inputPer1k: 0.0008, outputPer1k: 0.004 },
};

/**
 * Estimate the USD cost of a single AI call.
 * Returns `undefined` when the model is unknown (so we don't record a misleading $0).
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number | undefined {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return undefined;
  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;
  return (input / 1000) * pricing.inputPer1k + (output / 1000) * pricing.outputPer1k;
}
