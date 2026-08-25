// Gift suggestion feature prompt (Section 7.3). Builds the user-turn prompt
// from already-fetched context — this module does no DB or network I/O.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "./base";
import type { GiftRow, OccasionType, PersonInterestRow, PersonRow } from "../../db/database.types";

export const GIFT_SUGGESTION_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are generating gift suggestions for a specific person and occasion. You will be given that person's interests, their gift history (including how they reacted to past gifts, when known), any previously-dismissed suggestions to avoid repeating, and a budget range.

Return a JSON array of EXACTLY three suggestions, one for each price tier: "low", "mid", "high". Each suggestion must be a JSON object with exactly these fields:
{
  "title": string,
  "reasoning": string,
  "priceTier": "low" | "mid" | "high",
  "estimatedCostCents": integer,
  "category": string
}

Rules specific to this task:
- Each "reasoning" must reference something specific about this person from the context you were given — an interest, a past gift and how they reacted to it, something in their notes. A reasoning generic enough to apply to a stranger is a failed suggestion.
- "estimatedCostCents" must fall within or reasonably near the given budget range for that tier's position in the range (low tier near the bottom, high tier near the top).
- "category" must be one of: standard, apparel, custom, handmade, furniture, digital, experience — pick whichever best matches the shipping/lead-time profile of the suggested item.
- Do not suggest anything from the "previously dismissed" list, even reworded.
- Do not suggest the same category of item as a very recent past gift unless the person's reaction to it was "loved_it" and a repeat genuinely makes sense (e.g. consumable hobby supplies).
- Return ONLY the JSON array. No prose, no markdown fences.`;

export const giftSuggestionAiResponseSchema = z
  .array(
    z.object({
      title: z.string().min(1),
      reasoning: z.string().min(1),
      priceTier: z.enum(["low", "mid", "high"]),
      estimatedCostCents: z.number().int().positive(),
      category: z.enum(["standard", "apparel", "custom", "handmade", "furniture", "digital", "experience"]),
    })
  )
  .length(3);

export type GiftSuggestionAiResponse = z.infer<typeof giftSuggestionAiResponseSchema>;

export interface GiftSuggestionContext {
  personLabel: string; // from ChildTokenMap.labelFor — real name or CHILD_N
  relationshipType: string;
  ageYears: number | null;
  interests: Pick<PersonInterestRow, "interest" | "category" | "strength">[];
  recentGifts: Pick<GiftRow, "description" | "category" | "occasion_type" | "reaction">[];
  dismissedTitles: string[];
  occasionType: OccasionType;
  occasionDate: string; // ISO date
  budgetMinCents: number;
  budgetMaxCents: number;
}

export function buildGiftSuggestionUserPrompt(ctx: GiftSuggestionContext): string {
  const lines: string[] = [];
  lines.push(`Person: ${ctx.personLabel}`);
  lines.push(`Relationship: ${ctx.relationshipType}`);
  if (ctx.ageYears !== null) lines.push(`Age: ${ctx.ageYears}`);
  lines.push(`Occasion: ${ctx.occasionType} on ${ctx.occasionDate}`);
  lines.push(`Budget range: $${(ctx.budgetMinCents / 100).toFixed(2)} - $${(ctx.budgetMaxCents / 100).toFixed(2)}`);

  lines.push("");
  lines.push("Known interests:");
  if (ctx.interests.length === 0) {
    lines.push("(none recorded)");
  } else {
    for (const interest of ctx.interests) {
      lines.push(`- ${interest.interest} (${interest.strength}${interest.category ? `, ${interest.category}` : ""})`);
    }
  }

  lines.push("");
  lines.push("Recent gift history:");
  if (ctx.recentGifts.length === 0) {
    lines.push("(no recorded gift history)");
  } else {
    for (const gift of ctx.recentGifts) {
      const reaction = gift.reaction ? `, reaction: ${gift.reaction}` : ", reaction: unknown";
      lines.push(`- ${gift.occasion_type}: "${gift.description}"${gift.category ? ` (${gift.category})` : ""}${reaction}`);
    }
  }

  if (ctx.dismissedTitles.length > 0) {
    lines.push("");
    lines.push("Previously dismissed suggestions (do not repeat, even reworded):");
    for (const title of ctx.dismissedTitles) lines.push(`- ${title}`);
  }

  return lines.join("\n");
}

export function estimateAgeYears(birthdate: PersonRow["birthdate"], birthYearKnown: boolean, today: Date): number | null {
  if (!birthdate || !birthYearKnown) return null;
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  // A future birthdate (bad input from before server-side validation
  // existed, or a birth_year_known flag on stale data) must never render
  // as a negative age — treat it as unknown rather than clamp to 0, since
  // 0 has its own meaning (a baby born this year).
  return age < 0 ? null : age;
}
