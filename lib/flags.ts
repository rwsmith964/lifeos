import type { SupabaseClient } from "@supabase/supabase-js";
import { featureFlagsRepo, getFeatureFlagRow, listFeatureFlagsForHousehold } from "./db/repositories/feature-flags";

/**
 * Registry of every feature flag introduced by the "Build Brief -- Competitive
 * Parity + Moat Extension" engagement (D-115 onward). Per the Additive
 * Contract (brief Section 3.2): every module ships behind one of these,
 * default OFF, and with every flag off the app must behave identically to
 * before this engagement started. Add a new key here (and nowhere else) when
 * starting a new module so the whole set stays discoverable in one place.
 */
// A3 (audit pass 2026-09-11): these descriptions used to read "Module 3:
// per-field confidence scoring, review queue..." -- internal module numbers
// and implementation jargon with no user-facing meaning. Rewritten in plain
// language; see FLAG_ROUTES below for which of these actually have
// somewhere to go once turned on.
export const FEATURE_FLAGS = {
  relationship_gift_engine_v2:
    "Track relationships in more depth on each person's page: a conversation log, shared moments, and a smarter gift pipeline.",
  leisure_planner_v2:
    "Score activity ideas against real conditions (weather, tides, river flow), with a gear checklist and outing log for each one.",
  universal_intake_v2:
    "Forward an email, photo, or screenshot and let LifeOS draft the event, gift idea, or note for you to review.",
  scheduling_v2: "Two-way sync with an Apple or Outlook calendar, plus travel-time-aware conflict warnings.",
  ambient_display: "A read-only display for a tablet or spare screen -- today's schedule and custody, glanceable from across the room.",
  execution_draft_only:
    "Give the household assistant its own email address so it can draft replies on your behalf -- you approve every send.",
  household_layer: "Meal planning, a shared grocery list, and household chores.",
  brief_registration_v2: "Internal: lets other modules add their own section to your daily briefing.",
  // D-139 (roadmap R-2): trip packing checklist wizard -- separate from
  // Module 2's gear_checklist_items (single-activity gear), this is a
  // multi-day-trip checklist generated from trip type/duration/activities.
  packing_checklist_v2: "AI-generated packing checklists based on a trip's length, destination, and planned activities.",
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * Where to send a household once a flag is turned on -- A3 found several
 * modules enabled in Settings with no reachable entry point anywhere in the
 * app (not even a stray link), so a household could turn one on and never
 * see any effect. Omitted entirely for a flag with no page at all
 * (scheduling_v2's CalDAV sync and brief_registration_v2 are backend-only,
 * see QUESTIONS.md) and for flags whose effect is embedded directly into an
 * existing page rather than a separate destination (relationship_gift_engine_v2
 * on person pages, leisure_planner_v2 on Activities) -- both already
 * reachable just by visiting the page they augment.
 */
export const FLAG_ROUTES: Partial<Record<FeatureFlagKey, string>> = {
  universal_intake_v2: "/intake",
  ambient_display: "/ambient",
  execution_draft_only: "/execution",
  household_layer: "/household",
  packing_checklist_v2: "/packing",
};

/**
 * Flags with genuinely no UI anywhere -- toggling them currently has no
 * observable effect for a household member, so A3's "hide the toggle until
 * it's wired up" applies rather than "give it a way in." Not removed from
 * FEATURE_FLAGS/the schema, just excluded from the Settings list a
 * household sees. See QUESTIONS.md for the logged decision.
 */
export const FLAGS_HIDDEN_FROM_SETTINGS: readonly FeatureFlagKey[] = ["scheduling_v2", "brief_registration_v2"];

/**
 * True only if a row exists for this household+flag AND enabled=true.
 * Absence of a row (the default state for every household on every flag,
 * since nothing seeds these rows) means "not enabled" -- this is the single
 * fallback every gated route/component/service must call before doing any
 * new-module behavior, so a fresh household with zero feature_flags rows
 * behaves exactly like the app did before this engagement.
 */
export async function isFeatureEnabled(
  client: SupabaseClient,
  householdId: string,
  key: FeatureFlagKey
): Promise<boolean> {
  const row = await getFeatureFlagRow(client, householdId, key);
  return row?.enabled ?? false;
}

/** Every flag's resolved state for a household, keyed the same as FEATURE_FLAGS -- for a Settings toggle list. */
export async function listFeatureFlagStates(
  client: SupabaseClient,
  householdId: string
): Promise<Record<FeatureFlagKey, boolean>> {
  const rows = await listFeatureFlagsForHousehold(client, householdId);
  const enabledByKey = new Map(rows.map((r) => [r.flag_key, r.enabled]));
  const result = {} as Record<FeatureFlagKey, boolean>;
  for (const key of Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]) {
    result[key] = enabledByKey.get(key) ?? false;
  }
  return result;
}

/** Owner/adult-gated by RLS on the feature_flags table itself -- callers don't need to re-check role. */
export async function setFeatureFlag(
  client: SupabaseClient,
  householdId: string,
  key: FeatureFlagKey,
  enabled: boolean
): Promise<void> {
  await featureFlagsRepo.upsert(
    client,
    { household_id: householdId, flag_key: key, enabled },
    "household_id,flag_key"
  );
}
