// Weekend-plan one-click scheduling (D-131 / Section 9's "accept the plan"
// gap). generateWeekendPlan() (generate.ts) persists the structured winning
// candidate onto weekend_plans; this module turns that into real
// calendar_events rows. Pure slot-finding logic lives here so it's
// characterization-testable without a database; the orchestrator
// (acceptWeekendPlan) is the only async/DB-touching part, and it writes
// exclusively through existing repository functions (userActivitiesRepo,
// activityLocationsRepo, calendarEventsRepo, weekendPlansRepo) — never a
// raw insert.
import type { SupabaseClient } from "@supabase/supabase-js";
import { subHours } from "date-fns";
import { activityLocationsRepo, userActivitiesRepo } from "../db/repositories/activities";
import { calendarEventsRepo, listCustodyBlocksForHouseholdInRange, listEventsInRange } from "../db/repositories/calendar";
import { weekendPlansRepo } from "../db/repositories/system";
import { findOpenBlocks, type BusyPeriod } from "./available-blocks";

// D-131 (QUEUE-036): most requires_prep activities predate
// prep_duration_minutes and have it null. 30 minutes is a reasonable
// default for "get gear together" style prep; see QUESTIONS.md for the
// full assumption record.
const DEFAULT_PREP_DURATION_MINUTES = 30;

// D-131 (QUEUE-036): how far back before the ideal prep time to search for
// an alternate open slot when something already occupies it (e.g. a
// Friday-evening prep obligation bumped by a family dinner falls back to
// earlier Friday evening or Saturday morning, never past the event itself).
const PREP_SLOT_SEARCH_LOOKBACK_HOURS = 15;

export interface EventWindow {
  start: Date;
  end: Date;
}

/**
 * The main activity event's [start, end): starts exactly at the
 * recommended block's start, and runs for the activity's typical duration
 * — capped to the block's own end so a long activity never spills past the
 * open window the planner actually verified was free.
 */
export function computeMainEventWindow(blockStart: Date, blockEnd: Date, typicalDurationMinutes: number): EventWindow {
  const idealEnd = new Date(blockStart.getTime() + typicalDurationMinutes * 60_000);
  const end = idealEnd < blockEnd ? idealEnd : blockEnd;
  return { start: blockStart, end };
}

/**
 * Finds where the prep obligation should actually land. Prefers the ideal
 * slot (`prepAt` for `durationMinutes`) when nothing conflicts with it —
 * this is the common case (e.g. Friday evening, nothing else scheduled).
 * If the ideal slot is busy, falls back to the nearest sufficiently-long
 * open block within [searchWindowStart, searchWindowEnd], preferring
 * whichever is closest in time to the ideal slot. Returns null if no block
 * anywhere in the search window is long enough — the caller creates the
 * main event regardless and reports prep as unscheduled (QUEUE-036).
 */
export function resolvePrepSlot(
  prepAt: Date,
  durationMinutes: number,
  searchWindowStart: Date,
  searchWindowEnd: Date,
  busyPeriods: BusyPeriod[]
): EventWindow | null {
  const idealEnd = new Date(prepAt.getTime() + durationMinutes * 60_000);
  const idealFitsWindow = prepAt >= searchWindowStart && idealEnd <= searchWindowEnd;
  const idealConflicts = busyPeriods.some((b) => b.start < idealEnd && b.end > prepAt);
  if (idealFitsWindow && !idealConflicts) {
    return { start: prepAt, end: idealEnd };
  }

  const openBlocks = findOpenBlocks(searchWindowStart, searchWindowEnd, busyPeriods).filter(
    (b) => b.durationMinutes >= durationMinutes
  );
  if (openBlocks.length === 0) return null;

  const closest = openBlocks.reduce((best, b) => {
    const bestDistance = Math.abs(best.start.getTime() - prepAt.getTime());
    const distance = Math.abs(b.start.getTime() - prepAt.getTime());
    return distance < bestDistance ? b : best;
  });
  return { start: closest.start, end: new Date(closest.start.getTime() + durationMinutes * 60_000) };
}

export type AcceptWeekendPlanResult =
  | { status: "accepted"; activityEventId: string; prepEventId: string | null; prepSkipped: boolean }
  | { status: "already_accepted"; activityEventId: string | null; prepEventId: string | null }
  | { status: "no_recommendation" }
  | { status: "not_found" };

/**
 * Idempotent: re-calling with the same weekendPlanId after it's already
 * accepted returns the previously-created event IDs instead of creating
 * duplicates (D-131's "one-click" contract — a double-click or a retried
 * request must not double-book the calendar).
 */
export async function acceptWeekendPlan(
  client: SupabaseClient,
  params: { weekendPlanId: string; householdId: string; createdByPersonId: string }
): Promise<AcceptWeekendPlanResult> {
  const { weekendPlanId, householdId, createdByPersonId } = params;

  const plan = await weekendPlansRepo.getById(client, weekendPlanId);
  // Tenant scoping: a plan ID from another household must 404 exactly like
  // one that doesn't exist at all, never leak whether it exists.
  if (!plan || plan.household_id !== householdId) {
    return { status: "not_found" };
  }
  if (plan.accepted_at != null) {
    return {
      status: "already_accepted",
      activityEventId: plan.activity_calendar_event_id,
      prepEventId: plan.prep_calendar_event_id,
    };
  }
  if (!plan.recommended_activity_id || !plan.recommended_block_start || !plan.recommended_block_end) {
    return { status: "no_recommendation" };
  }

  const activity = await userActivitiesRepo.getById(client, plan.recommended_activity_id);
  if (!activity || activity.household_id !== householdId) {
    return { status: "no_recommendation" };
  }
  const location = plan.recommended_location_id ? await activityLocationsRepo.getById(client, plan.recommended_location_id) : null;

  const blockStart = new Date(plan.recommended_block_start);
  const blockEnd = new Date(plan.recommended_block_end);
  const mainWindow = computeMainEventWindow(blockStart, blockEnd, activity.typical_duration_minutes);

  const activityEvent = await calendarEventsRepo.create(client, {
    household_id: householdId,
    created_by_person_id: createdByPersonId,
    title: location?.name ? `${activity.activity_type} at ${location.name}` : activity.activity_type,
    starts_at: mainWindow.start.toISOString(),
    ends_at: mainWindow.end.toISOString(),
    location: location?.name ?? null,
    location_lat: location?.lat ?? null,
    location_lng: location?.lng ?? null,
    travel_time_before_minutes: plan.travel_minutes_each_way,
    event_type: "personal",
    related_activity_id: activity.id,
  });

  let prepEventId: string | null = null;
  let prepSkipped = false;
  if (activity.requires_prep && activity.prep_lead_time_hours != null) {
    const prepAt = subHours(mainWindow.start, activity.prep_lead_time_hours);
    const prepDuration = activity.prep_duration_minutes ?? DEFAULT_PREP_DURATION_MINUTES;
    const searchWindowStart = subHours(prepAt, PREP_SLOT_SEARCH_LOOKBACK_HOURS);
    const searchWindowEnd = mainWindow.start;

    const [events, custodyBlocks] = await Promise.all([
      listEventsInRange(client, householdId, searchWindowStart.toISOString(), searchWindowEnd.toISOString()),
      listCustodyBlocksForHouseholdInRange(client, householdId, searchWindowStart.toISOString(), searchWindowEnd.toISOString()),
    ]);
    const busyPeriods: BusyPeriod[] = [
      // Exclude the activity event just created — it can't conflict with
      // its own prep by definition, and listEventsInRange's window ends
      // exactly at its start anyway, but being explicit costs nothing.
      ...events.filter((e) => e.id !== activityEvent.id).map((e) => ({ start: new Date(e.starts_at), end: new Date(e.ends_at) })),
      ...custodyBlocks.map((c) => ({ start: new Date(c.starts_at), end: new Date(c.ends_at) })),
    ];

    const slot = resolvePrepSlot(prepAt, prepDuration, searchWindowStart, searchWindowEnd, busyPeriods);
    if (slot) {
      const prepEvent = await calendarEventsRepo.create(client, {
        household_id: householdId,
        created_by_person_id: createdByPersonId,
        title: `Prep for ${activity.activity_type}`,
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
        event_type: "prep",
        related_activity_id: activity.id,
      });
      prepEventId = prepEvent.id;
    } else {
      // QUEUE-036: no open slot found anywhere in the lookback window --
      // the main event is still created; prep is left for the user to
      // schedule manually rather than silently dropped or force-placed
      // over something else.
      prepSkipped = true;
    }
  }

  await weekendPlansRepo.update(client, plan.id, {
    accepted_at: new Date().toISOString(),
    activity_calendar_event_id: activityEvent.id,
    prep_calendar_event_id: prepEventId,
  });

  return { status: "accepted", activityEventId: activityEvent.id, prepEventId, prepSkipped };
}
