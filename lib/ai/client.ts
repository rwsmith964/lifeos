// The single wrapper every AI feature calls through (Section 11.1, 11.3).
// Logging to ai_usage_log happens here and only here, so it can't be
// bypassed by a feature module that forgets to log its own call.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { householdsRepo } from "../db/repositories/households";
import { aiUsageLogRepo, sumAiSpendToday } from "../db/repositories/system";
import { createSupabaseServiceRoleClient } from "../db/client-service-role";
import { AI_MODEL, estimateCostCents } from "./pricing";
import { buildAiTestFixtureResponse, isAiTestFixtureModeEnabled } from "./test-fixtures";

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
  /**
   * Module 3 (D-119, universal_intake_v2): optional image/PDF attachment
   * for intake's image/screenshot/pdf sources (lib/intake/parse.ts). When
   * set, the user turn becomes [attachment, userPrompt] instead of plain
   * text — every existing caller omits this and gets exactly the prior
   * text-only behavior.
   */
  attachment?: {
    base64Data: string;
    mediaType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf";
  };
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
  // D-148: AI_TEST_MODE is set ONLY by the Playwright E2E CI job (never in
  // dev or production — see .github/workflows/verify.yml). It short-
  // circuits ONLY the anthropic.messages.create() network call below
  // (guarded again right at that call site); isAiConfigured() above still
  // requires a truthy (placeholder) ANTHROPIC_API_KEY, and the household
  // lookup, budget ceiling check, and ai_usage_log write all still run for
  // real against the E2E job's real ephemeral Supabase instance, so those
  // code paths stay covered by the same specs.
  const anthropic = getAnthropicClient();
  if (!anthropic) throw new AiUnavailableError();

  // ai_usage_log has no RLS policy for ordinary authenticated writes/reads
  // by design (migration 20260820000012: "written only by lib/ai/client.ts
  // via the service role") — every caller of callAi passes the
  // request-scoped, user-authenticated client, which can only read a
  // household's own row and never this table. Route the spend check and
  // the usage write through the service-role client instead; the household
  // lookup stays on the caller's client since members can read their own
  // household under normal RLS.
  const serviceRoleClient = createSupabaseServiceRoleClient();

  const household = await householdsRepo.getById(dbClient, params.householdId);
  const ceilingCents = household?.ai_daily_spend_ceiling_cents ?? 50;
  const spentTodayCents = await sumAiSpendToday(serviceRoleClient, params.householdId);
  if (spentTodayCents >= ceilingCents) {
    throw new AiBudgetExceededError(
      `Household ${params.householdId} has spent ${spentTodayCents}c today, at/over its ${ceilingCents}c daily ceiling`
    );
  }

  let text: string;
  let inputTokens: number;
  let outputTokens: number;

  if (isAiTestFixtureModeEnabled()) {
    const fixture = buildAiTestFixtureResponse(params);
    text = fixture.text;
    inputTokens = fixture.inputTokens;
    outputTokens = fixture.outputTokens;
  } else {
    let response: Anthropic.Message;
    try {
      // Additive: only build a multi-block content array when an attachment
      // was actually passed. Every pre-existing caller has no `attachment`
      // field at all, so `content` stays the plain string it always was.
      const content: Anthropic.MessageParam["content"] = params.attachment
        ? [
            params.attachment.mediaType === "application/pdf"
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: params.attachment.base64Data } }
              : {
                  type: "image",
                  source: { type: "base64", media_type: params.attachment.mediaType, data: params.attachment.base64Data },
                },
            { type: "text", text: params.userPrompt },
          ]
        : params.userPrompt;
      response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: params.maxTokens ?? 2048,
        system: params.systemPrompt,
        messages: [{ role: "user", content }],
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

    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;
    text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }

  const costCents = estimateCostCents(inputTokens, outputTokens);

  await aiUsageLogRepo.create(serviceRoleClient, {
    household_id: params.householdId,
    feature: params.feature,
    model: AI_MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_cents: costCents,
  });

  return { text, model: AI_MODEL, inputTokens, outputTokens, costCents };
}
