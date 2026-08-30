// D-070 (P1-8): extracted from lib/planner/generate.ts so the opportunity
// detector can apply the exact same "don't keep proposing the same thing"
// recency penalty the weekend planner already used -- one of the missing
// inputs that made Opportunities and the weekend plan disagree about the
// same activity/day (Opportunities scored purely on weather; the weekend
// plan additionally penalized an activity recently recommended).
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeekendPlanForDate } from "../db/repositories/system";
import type { WeekendPlanAiResponse } from "../ai/prompts/weekend-plan";

export const RECENCY_LOOKBACK_WEEKS = 4;

export function nextSaturdayFrom(today: Date): Date {
  const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
  return new Date(
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() +
      (daysUntilSaturday === 0 ? 7 : daysUntilSaturday) * 24 * 60 * 60 * 1000
  );
}

/** Activity types that were the top weekend-plan recommendation in each of the past N Saturdays, most recent first. */
export async function listRecentlyProposedActivityTypes(
  client: SupabaseClient,
  householdId: string,
  today: Date
): Promise<string[]> {
  const types: string[] = [];
  for (let i = 1; i <= RECENCY_LOOKBACK_WEEKS; i++) {
    const saturday = format(addDays(nextSaturdayFrom(today), -7 * i), "yyyy-MM-dd");
    const plan = await getWeekendPlanForDate(client, householdId, saturday);
    const content = plan?.content_json as WeekendPlanAiResponse | undefined;
    if (content?.recommendation) types.push(content.recommendation.activityType);
  }
  return types;
}

export function weeksSinceLastProposed(activityType: string, recentActivityTypes: string[]): number | null {
  return recentActivityTypes.includes(activityType) ? recentActivityTypes.lastIndexOf(activityType) : null;
}

// D-083 (P3-1): the ground-truth counterpart to weeksSinceLastProposed --
// "was this activity actually done recently" rather than "was it merely the
// planner's top pick recently" (an activity can be proposed and never acted
// on, or done without ever having been the AI's Saturday recommendation).
// Anchored on `today` the same way weeksSinceLastProposed's lookback is,
// not on whichever future day is being scored -- keeping both recency
// signals on the same clock is what let D-070 make Opportunities and the
// weekend plan agree in the first place.
export function weeksSinceLastDone(lastDoneAt: string | null, today: Date): number | null {
  if (!lastDoneAt) return null;
  const days = differenceInCalendarDays(today, parseISO(lastDoneAt));
  if (days < 0) return null; // last_done_at somehow in the future -- treat as no signal rather than a negative
  return Math.floor(days / 7);
}
