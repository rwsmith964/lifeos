// Module 4 — preference memory (brief: "cadences, who gets responded to
// first, how the brief should be framed, quiet hours, preferred activity
// windows... store as structured preferences, not as free-text prompt
// stuffing"). Thin wrapper over lib/db/repositories/scheduling.ts's
// upsert-on-natural-key functions, plus the one bit of derived logic that
// belongs in a pure/testable function rather than inline in a caller:
// "is this moment inside quiet hours."
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdSchedulingPreferencesRow } from "../db/database.types";
import {
  getSchedulingPreferencesForHousehold,
  upsertSchedulingPreferencesForHousehold,
} from "../db/repositories/scheduling";

export type { HouseholdSchedulingPreferencesRow };

const DEFAULT_BRIEF_FRAMING: HouseholdSchedulingPreferencesRow["brief_framing"] = "balanced";

/** Resolved preferences with every field defaulted — never null-check at every call site. */
export interface ResolvedSchedulingPreferences {
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  responsePriorityPersonIds: string[];
  briefFraming: HouseholdSchedulingPreferencesRow["brief_framing"];
  preferredActivityWindows: HouseholdSchedulingPreferencesRow["preferred_activity_windows"];
  scheduleReviewCadenceDays: number | null;
}

const NO_PREFERENCES_SET: ResolvedSchedulingPreferences = {
  quietHoursStart: null,
  quietHoursEnd: null,
  responsePriorityPersonIds: [],
  briefFraming: DEFAULT_BRIEF_FRAMING,
  preferredActivityWindows: [],
  scheduleReviewCadenceDays: null,
};

export function resolvePreferences(row: HouseholdSchedulingPreferencesRow | null): ResolvedSchedulingPreferences {
  if (!row) return NO_PREFERENCES_SET;
  return {
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    responsePriorityPersonIds: row.response_priority_person_ids,
    briefFraming: row.brief_framing,
    preferredActivityWindows: row.preferred_activity_windows,
    scheduleReviewCadenceDays: row.schedule_review_cadence_days,
  };
}

export async function getResolvedSchedulingPreferences(
  client: SupabaseClient,
  householdId: string
): Promise<ResolvedSchedulingPreferences> {
  const row = await getSchedulingPreferencesForHousehold(client, householdId);
  return resolvePreferences(row);
}

export { upsertSchedulingPreferencesForHousehold as saveSchedulingPreferences };

function toMinutesSinceMidnight(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * True if `atTime` (HH:MM, in the household's own local time — the caller
 * is responsible for timezone conversion, same division of concerns as the
 * rest of the brief pipeline) falls inside the household's quiet hours.
 * Handles a window that wraps past midnight (e.g. 21:00 -> 07:00).
 * Returns false when quiet hours aren't set at all.
 */
export function isWithinQuietHours(
  preferences: Pick<ResolvedSchedulingPreferences, "quietHoursStart" | "quietHoursEnd">,
  atTime: string
): boolean {
  if (!preferences.quietHoursStart || !preferences.quietHoursEnd) return false;

  const start = toMinutesSinceMidnight(preferences.quietHoursStart);
  const end = toMinutesSinceMidnight(preferences.quietHoursEnd);
  const at = toMinutesSinceMidnight(atTime);

  if (start === end) return false; // zero-width window means "no quiet hours", not "always quiet"
  if (start < end) return at >= start && at < end;
  // Wraps past midnight, e.g. 21:00 -> 07:00.
  return at >= start || at < end;
}

/**
 * Orders `personIds` by the household's response-priority preference, most
 * important first; anyone not named in the preference keeps their original
 * relative order and is appended after every explicitly prioritized person.
 */
export function sortByResponsePriority(personIds: string[], responsePriorityPersonIds: string[]): string[] {
  const priorityRank = new Map(responsePriorityPersonIds.map((id, index) => [id, index]));
  return [...personIds].sort((a, b) => {
    const rankA = priorityRank.get(a);
    const rankB = priorityRank.get(b);
    if (rankA != null && rankB != null) return rankA - rankB;
    if (rankA != null) return -1;
    if (rankB != null) return 1;
    return 0;
  });
}
