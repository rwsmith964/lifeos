// Cost estimation for ai_usage_log (Section 11.3). Pure and unit-tested so
// the budget-ceiling logic in lib/ai/client.ts can be tested without a live
// API call.
//
// Per-million-token rates below match claude-sonnet-4-6's published pricing
// ($3/$15 per MTok in/out) as of this build — not fetched live from
// Anthropic. See DECISIONS.md D-014. Revisit against the current pricing
// page when writing docs/ai-costs.md (Phase 8) or if actual invoiced cost
// drifts from what ai_usage_log projects.
export const AI_MODEL = "claude-sonnet-4-6";

export const AI_PRICING_CENTS_PER_MILLION_TOKENS = {
  input: 300, // $3.00 / MTok
  output: 1500, // $15.00 / MTok
} as const;

export function estimateCostCents(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * AI_PRICING_CENTS_PER_MILLION_TOKENS.input;
  const outputCost = (outputTokens / 1_000_000) * AI_PRICING_CENTS_PER_MILLION_TOKENS.output;
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}
