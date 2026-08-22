// The single wrapper every AI feature calls through (Section 11.1, 11.3).
// Logging to ai_usage_log happens here and only here, so it can't be
// bypassed by a feature module that forgets to log its own call.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { householdsRepo } from "../db/repositories/households";
import { aiUsageLogRepo, sumAiSpendToday } from "../db/repositories/system";
import { AI_MODEL, estimateCostCents } from "./pricing";

export class AiUnavailableError extends Error {
  constructor(message = "ANTHROPIC_API_KEY is not configured") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export class AiBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiBudgetExceededError";
  }
}

let cachedClient: Anthropic | null | undefined;

function getAnthropicClient(): Anthropic | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  cachedClient = apiKey ? new Anthropic({ apiKey }) : null;
  return cachedClient;
}

export function isAiConfigured(): boolean {
  return getAnthropicClient() !== null;
}

export interface AiCallParams {
  householdId: string;
  /** 'gift_suggestion' | 'daily_brief' | 'weekend_plan', see Section 11.3. */
  feature: string;
  systemPrompt: string;
  userPrompt: string;
  /** Default 2048 — these are short structured-JSON features, not chat. */
  maxTokens?: number;
}

export interface AiCallResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

/**
 * Throws AiUnavailableError (no API key) or AiBudgetExceededError (today's
 * household spend is at/over households.ai_daily_spend_ceiling_cents).
 * Every caller MUST catch both and fall back to a non-AI/templated path —
 * see lib/gifts/suggest.ts and the brief engine for the pattern. Never let
 * either propagate to an unhandled route error; that violates Section 12.4
 * ("degrade gracefully in production") and Section 11.3 directly.
 */
export async function callAi(dbClient: SupabaseClient, params: AiCallParams): Promise<AiCallResult> {
  const anthropic = getAnthropicClient();
  if (!anthropic) throw new AiUnavailableError();

  const household = await householdsRepo.getById(dbClient, params.householdId);
  const ceilingCents = household?.ai_daily_spend_ceiling_cents ?? 50;
  const spentTodayCents = await sumAiSpendToday(dbClient, params.householdId);
  if (spentTodayCents >= ceilingCents) {
    throw new AiBudgetExceededError(
      `Household ${params.householdId} has spent ${spentTodayCents}c today, at/over its ${ceilingCents}c daily ceiling`
    );
  }

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: params.maxTokens ?? 2048,
      system: params.systemPrompt,
      messages: [{ role: "user", content: params.userPrompt }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AiUnavailableError(`Anthropic API rejected the configured key: ${error.message}`);
    }
    // Rate limits, 5xx, connection errors, bad requests: surface as-is.
    // Callers that only handle the two error types above will let this
    // propagate, which is correct — an APIError is a real failure, not a
    // "gracefully unavailable" state.
    throw error;
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costCents = estimateCostCents(inputTokens, outputTokens);

  await aiUsageLogRepo.create(dbClient, {
    household_id: params.householdId,
    feature: params.feature,
    model: AI_MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_cents: costCents,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return { text, model: AI_MODEL, inputTokens, outputTokens, costCents };
}
