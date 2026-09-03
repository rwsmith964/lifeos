// Packing checklist feature prompt (D-139, roadmap R-2). Builds the
// user-turn prompt from already-fetched context -- this module does no DB
// or network I/O, same shape as gift-suggestion.ts.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "./base";
import type { TripType } from "../../db/database.types";

export const PACKING_CHECKLIST_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are generating a travel packing checklist for a specific trip. You will be given the trip type, its duration, who is traveling (as labels only -- some may be CHILD_N tokens; never guess what those stand for), the destination if known, and any planned activities the household described in their own words.

Return a JSON array of packing items. Each item must be a JSON object with exactly these fields:
{
  "label": string,
  "category": string
}

Rules specific to this task:
- "category" must be one of: clothing, toiletries, documents, electronics, kids, activity_gear, health, other -- pick whichever best matches the item.
- Cover the trip's baseline needs (clothing appropriate to trip length and type, toiletries, documents) AND anything specific to the stated planned activities (e.g. "hiking" implies boots and a water bottle; "beach" implies swimsuits and sunscreen).
- If children are traveling (a CHILD_N label appears in the traveler list), include a small number of clearly kid-specific items (category "kids") such as entertainment for the trip itself or a comfort item -- but do not invent specifics about a particular child you weren't told (no ages, no favorite toy names) beyond what the context gave you.
- Do not pad the list with items unrelated to the stated trip type, duration, or activities just to make it longer. A shorter, accurate list beats a longer generic one.
- Return between 8 and 30 items total.
- Return ONLY the JSON array. No prose, no markdown fences.`;

export const packingChecklistAiResponseSchema = z
  .array(
    z.object({
      label: z.string().min(1),
      category: z.enum(["clothing", "toiletries", "documents", "electronics", "kids", "activity_gear", "health", "other"]),
    })
  )
  .min(1);

export type PackingChecklistAiResponse = z.infer<typeof packingChecklistAiResponseSchema>;

export interface PackingChecklistContext {
  tripType: TripType;
  destination: string | null;
  /** Inclusive day count, e.g. Fri-Sun = 3. Null when no dates were given. */
  durationDays: number | null;
  travelerLabels: string[]; // from ChildTokenMap.labelFor -- real names or CHILD_N tokens
  plannedActivities: string | null;
}

// Exported so UI components (the wizard's trip-type select, the list
// page's badge) show the exact same wording as the prompt, rather than
// maintaining a second copy that can drift.
export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  beach: "Beach",
  city: "City",
  camping: "Camping",
  ski_snow: "Ski/snow",
  road_trip: "Road trip",
  visiting_family: "Visiting family",
  international: "International",
  business: "Business",
  other: "Other",
};

export function buildPackingChecklistUserPrompt(ctx: PackingChecklistContext): string {
  const lines: string[] = [];
  lines.push(`Trip type: ${TRIP_TYPE_LABELS[ctx.tripType]}`);
  if (ctx.destination) lines.push(`Destination: ${ctx.destination}`);
  lines.push(`Duration: ${ctx.durationDays !== null ? `${ctx.durationDays} day(s)` : "unspecified"}`);
  lines.push(`Travelers: ${ctx.travelerLabels.length > 0 ? ctx.travelerLabels.join(", ") : "unspecified"}`);

  lines.push("");
  lines.push("Planned activities (in the household's own words):");
  lines.push(ctx.plannedActivities?.trim() ? ctx.plannedActivities.trim() : "(none described)");

  return lines.join("\n");
}
