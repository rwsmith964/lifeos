// Packing checklist orchestration (D-139, roadmap R-2). Fetches context,
// calls the AI, parses defensively with one retry, persists the generated
// items. Same shape as lib/gifts/suggest.ts -- the only module in
// lib/packing/ that touches the database or the network.
import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays } from "date-fns";
import { AiBudgetExceededError, AiUnavailableError, callAi } from "../ai/client";
import { buildChildTokenMap } from "../ai/context";
import { parseAiJson } from "../ai/parse-json";
import {
  PACKING_CHECKLIST_SYSTEM_PROMPT,
  buildPackingChecklistUserPrompt,
  packingChecklistAiResponseSchema,
} from "../ai/prompts/packing-checklist";
import type { PackingListItemRow, PackingListRow } from "../db/database.types";
import { listPeopleForHousehold } from "../db/repositories/people";
import { packingListItemsRepo } from "../db/repositories/packing";

export type GeneratePackingChecklistResult =
  | { status: "generated"; items: PackingListItemRow[] }
  | { status: "ai_unavailable"; reason: string }
  | { status: "budget_exceeded"; reason: string }
  | { status: "parse_failed"; reason: string };

/** Inclusive day count between two ISO dates, e.g. Fri-Sun = 3. Null when either date is missing. */
function computeDurationDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;
  return differenceInCalendarDays(new Date(`${endDate}T00:00:00`), new Date(`${startDate}T00:00:00`)) + 1;
}

export async function generatePackingChecklist(
  client: SupabaseClient,
  packingList: PackingListRow
): Promise<GeneratePackingChecklistResult> {
  const householdPeople = await listPeopleForHousehold(client, packingList.household_id);
  const tokenMap = buildChildTokenMap(householdPeople);
  const peopleById = new Map(householdPeople.map((p) => [p.id, p]));

  const travelerLabels = packingList.traveler_person_ids
    .map((id) => peopleById.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => tokenMap.labelFor(p));

  const userPrompt = buildPackingChecklistUserPrompt({
    tripType: packingList.trip_type,
    destination: packingList.destination,
    durationDays: computeDurationDays(packingList.start_date, packingList.end_date),
    travelerLabels,
    plannedActivities: packingList.planned_activities,
  });

  let lastError: string | undefined;
  let validated: ReturnType<typeof packingChecklistAiResponseSchema.safeParse> | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    let responseText: string;
    try {
      const result = await callAi(client, {
        householdId: packingList.household_id,
        feature: "packing_checklist",
        systemPrompt: PACKING_CHECKLIST_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 1536,
      });
      responseText = result.text;
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        console.error("Packing checklist unavailable:", error.message);
        return {
          status: "ai_unavailable",
          reason: "The packing checklist generator is temporarily unavailable. Try again in a few minutes.",
        };
      }
      if (error instanceof AiBudgetExceededError) {
        return { status: "budget_exceeded", reason: "Today's AI budget for this household has been reached — try again tomorrow." };
      }
      throw error; // a real API error (rate limit, 5xx) — not ours to swallow
    }

    const parsed = parseAiJson(responseText);
    if (!parsed.success) {
      lastError = `JSON parse failed: ${parsed.error}`;
      continue;
    }
    validated = packingChecklistAiResponseSchema.safeParse(parsed.data);
    if (validated.success) break;
    lastError = `Schema validation failed: ${validated.error.message}`;
  }

  if (!validated?.success) {
    console.error(`[packing_checklist] giving up after retry for list ${packingList.id}: ${lastError}`);
    return { status: "parse_failed", reason: lastError ?? "unknown parse failure" };
  }

  const created: PackingListItemRow[] = [];
  let sortOrder = 0;
  for (const item of validated.data) {
    const row = await packingListItemsRepo.create(client, {
      household_id: packingList.household_id,
      packing_list_id: packingList.id,
      label: tokenMap.restoreRealNames(item.label),
      category: item.category,
      sort_order: sortOrder,
      source: "ai",
    });
    created.push(row);
    sortOrder += 1;
  }

  return { status: "generated", items: created };
}
