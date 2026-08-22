// Gift suggestion orchestration (Section 7.3). Fetches context, calls the
// AI, parses defensively with one retry, computes order-by dates, and
// persists the three suggestions. This is the only module in lib/gifts/
// that touches the database or the network — everything it calls
// (leadtime, budget, occasions, feedback, retailer-links) is pure.
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { AiBudgetExceededError, AiUnavailableError, callAi } from "../ai/client";
import { buildChildTokenMap } from "../ai/context";
import { parseAiJson } from "../ai/parse-json";
import {
  GIFT_SUGGESTION_SYSTEM_PROMPT,
  buildGiftSuggestionUserPrompt,
  estimateAgeYears,
  giftSuggestionAiResponseSchema,
} from "../ai/prompts/gift-suggestion";
import { AI_MODEL } from "../ai/pricing";
import type { GiftSuggestionRow, OccasionType } from "../db/database.types";
import { householdsRepo } from "../db/repositories/households";
import {
  getShippingWindows,
  giftSuggestionsRepo,
  listDismissedSuggestionTitles,
  listGiftsForPerson,
} from "../db/repositories/gifts";
import { listBudgetsForPerson, listInterestsForPerson, listPeopleForHousehold, peopleRepo } from "../db/repositories/people";
import { resolveGiftBudget } from "./budget";
import { computeOrderByDate } from "./leadtime";
import { buildAmazonSearchLink } from "./retailer-links";

export type GenerateGiftSuggestionsResult =
  | { status: "generated"; suggestions: GiftSuggestionRow[] }
  | { status: "ai_unavailable"; reason: string }
  | { status: "budget_exceeded"; reason: string }
  | { status: "parse_failed"; reason: string };

export interface GenerateGiftSuggestionsParams {
  householdId: string;
  personId: string;
  occasionType: OccasionType;
  occasionDate: Date;
}

const ISO_DATE_FORMAT = "yyyy-MM-dd";

export async function generateGiftSuggestions(
  client: SupabaseClient,
  params: GenerateGiftSuggestionsParams
): Promise<GenerateGiftSuggestionsResult> {
  const [person, household] = await Promise.all([
    peopleRepo.getById(client, params.personId),
    householdsRepo.getById(client, params.householdId),
  ]);
  if (!person) throw new Error(`Person ${params.personId} not found`);
  if (!household) throw new Error(`Household ${params.householdId} not found`);

  const [interests, recentGifts, dismissedTitles, budgets, householdPeople] = await Promise.all([
    listInterestsForPerson(client, person.id),
    listGiftsForPerson(client, person.id, 5),
    listDismissedSuggestionTitles(client, person.id),
    listBudgetsForPerson(client, person.id),
    listPeopleForHousehold(client, params.householdId),
  ]);

  const budget = resolveGiftBudget(budgets, params.occasionType, household);
  const tokenMap = buildChildTokenMap(householdPeople);

  const userPrompt = buildGiftSuggestionUserPrompt({
    personLabel: tokenMap.labelFor(person),
    relationshipType: person.relationship_type,
    ageYears: estimateAgeYears(person.birthdate, person.birth_year_known, params.occasionDate),
    interests,
    recentGifts,
    dismissedTitles,
    occasionType: params.occasionType,
    occasionDate: format(params.occasionDate, ISO_DATE_FORMAT),
    budgetMinCents: budget.minCents,
    budgetMaxCents: budget.maxCents,
  });

  let lastError: string | undefined;
  let validated: ReturnType<typeof giftSuggestionAiResponseSchema.safeParse> | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    let responseText: string;
    try {
      const result = await callAi(client, {
        householdId: params.householdId,
        feature: "gift_suggestion",
        systemPrompt: GIFT_SUGGESTION_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 1536,
      });
      responseText = result.text;
    } catch (error) {
      if (error instanceof AiUnavailableError) return { status: "ai_unavailable", reason: error.message };
      if (error instanceof AiBudgetExceededError) return { status: "budget_exceeded", reason: error.message };
      throw error; // a real API error (rate limit, 5xx) — not ours to swallow
    }

    const parsed = parseAiJson(responseText);
    if (!parsed.success) {
      lastError = `JSON parse failed: ${parsed.error}`;
      continue;
    }
    validated = giftSuggestionAiResponseSchema.safeParse(parsed.data);
    if (validated.success) break;
    lastError = `Schema validation failed: ${validated.error.message}`;
  }

  if (!validated?.success) {
    console.error(`[gift_suggestion] giving up after retry for person ${person.id}: ${lastError}`);
    return { status: "parse_failed", reason: lastError ?? "unknown parse failure" };
  }

  const shippingWindows = await getShippingWindows(client);
  const occasionDateStr = format(params.occasionDate, ISO_DATE_FORMAT);

  const created: GiftSuggestionRow[] = [];
  for (const suggestion of validated.data) {
    const windowDays =
      shippingWindows.find((w) => w.category === suggestion.category)?.shipping_window_days ?? 5;
    const { orderByDate } = computeOrderByDate({
      occasionDate: params.occasionDate,
      shippingWindowDays: windowDays,
      handlingBufferDays: household.gift_handling_buffer_days,
      personalBufferDays: household.gift_personal_buffer_days,
    });

    const title = tokenMap.restoreRealNames(suggestion.title);
    const reasoning = tokenMap.restoreRealNames(suggestion.reasoning);
    const link = buildAmazonSearchLink(title);

    const row = await giftSuggestionsRepo.create(client, {
      person_id: person.id,
      occasion_type: params.occasionType,
      occasion_date: occasionDateStr,
      title,
      reasoning,
      price_tier: suggestion.priceTier,
      estimated_cost_cents: suggestion.estimatedCostCents,
      category: suggestion.category,
      product_url: link.url,
      retailer: link.retailer,
      order_by_date: format(orderByDate, ISO_DATE_FORMAT),
      model_version: AI_MODEL,
    });
    created.push(row);
  }

  return { status: "generated", suggestions: created };
}
