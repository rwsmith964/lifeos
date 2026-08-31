"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo, custodyBlocksRepo, eventAttendeesRepo } from "@/lib/db/repositories/calendar";
import { timeOffEntriesRepo } from "@/lib/db/repositories/work-schedule";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { generateWeekendPlan } from "@/lib/planner/generate";
import { friendlyMutationError } from "@/lib/db/errors";
import type { CalendarEventRow } from "@/lib/db/database.types";

export interface DeleteActionState {
  error: string | null;
}

// Full snapshot needed to recreate a deleted event on Undo (P0-1) — every
// column but the ones the DB assigns fresh on insert (id, created_at,
// updated_at), plus the attendee person ids, which live in a join table
// and aren't part of CalendarEventRow itself.
export interface CalendarEventUndoSnapshot {
  event: Omit<CalendarEventRow, "id" | "created_at" | "updated_at">;
  attendeePersonIds: string[];
}

export async function getCalendarEventSnapshotAction(eventId: string): Promise<CalendarEventUndoSnapshot | null> {
  const { supabase } = await requireHouseholdContext();
  const event = await calendarEventsRepo.getById(supabase, eventId);
  if (!event) return null;
  const attendees = await eventAttendeesRepo.list(supabase, (q) => q.eq("calendar_event_id", eventId));
  const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...rest } = event;
  return { event: rest, attendeePersonIds: attendees.map((a) => a.person_id) };
}

export async function deleteCalendarEventAction(eventId: string): Promise<DeleteActionState> {
  const { supabase } = await requireHouseholdContext();
  try {
    await calendarEventsRepo.remove(supabase, eventId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't delete this event — please try again." }) };
  }
  revalidatePath("/calendar");
  return { error: null };
}

// Recreates an event from a pre-delete snapshot (Undo). Produces a new row
// with a new id/timestamps — functionally identical to the user, but not
// literally the same database row, which is fine since nothing else
// references calendar_events by id across a delete.
export async function restoreCalendarEventAction(snapshot: CalendarEventUndoSnapshot): Promise<DeleteActionState> {
  const { supabase } = await requireHouseholdContext();
  try {
    const restored = await calendarEventsRepo.create(supabase, snapshot.event);
    if (snapshot.attendeePersonIds.length > 0) {
      await eventAttendeesRepo.createMany(
        supabase,
        snapshot.attendeePersonIds.map((personId) => ({ calendar_event_id: restored.id, person_id: personId }))
      );
    }
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't restore this event — please add it again manually." }) };
  }
  revalidatePath("/calendar");
  return { error: null };
}

export async function deleteCustodyBlockAction(blockId: string): Promise<DeleteActionState> {
  const { supabase } = await requireHouseholdContext();
  try {
    await custodyBlocksRepo.remove(supabase, blockId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't delete this custody block — please try again." }) };
  }
  revalidatePath("/calendar");
  return { error: null };
}

// D-064: time off is the one computed-calendar item that's still a real,
// deletable row (work shifts are computed-only, like birthdays, so they
// have no delete action at all). This calendar-scoped action mirrors
// deleteTimeOffAction on the person page (app/(app)/people/[id]/actions.ts)
// but only revalidates /calendar, since it's invoked from the calendar
// grid where there's no personId in scope to also revalidate a person page.
export async function deleteTimeOffFromCalendarAction(entryId: string): Promise<DeleteActionState> {
  const { supabase } = await requireHouseholdContext();
  try {
    await timeOffEntriesRepo.remove(supabase, entryId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't delete this time off entry — please try again." }) };
  }
  revalidatePath("/calendar");
  return { error: null };
}

export interface WeekendPlanActionState {
  error: string | null;
}

export async function generateWeekendPlanAction(): Promise<WeekendPlanActionState> {
  const { household } = await requireHouseholdContext();

  // weekend_plans (and the external_data_cache writes generateWeekendPlan
  // makes along the way) have no insert policy for regular authenticated
  // users by design — only the cron job's service-role client is meant to
  // write them (see the migration comment and DECISIONS.md D-029, which
  // fixed the identical bug for `briefs`). This on-demand path needs the
  // same swap: household.id is already resolved and scoped above, so
  // handing the rest of generation a service-role client doesn't broaden
  // what household it can touch.
  const serviceRoleClient = createSupabaseServiceRoleClient();

  try {
    const result = await generateWeekendPlan(serviceRoleClient, household.id);
    if (result.status === "ai_unavailable" || result.status === "budget_exceeded") {
      return { error: result.reason };
    }
    if (result.status === "no_candidates") {
      if (result.noCandidatesReason === "seasonally_unavailable") {
        // D-085 (P3-3): distinct from the missing-setup case below --
        // activities and a home address both exist, but every activity on
        // file is out of season or needs daylight this weekend doesn't
        // have. Telling someone to "add an activity" here would be wrong.
        return {
          error:
            "None of your activities are in season (or have enough daylight) this weekend — check back closer to the date, or adjust an activity's season window.",
        };
      }
      // Was misdirecting people to "add one under Activities" — the real
      // missing input is the household owner's home address (used to
      // compute travel time/distance to every activity), which lives on
      // Settings, not per-activity (see generateWeekendPlan in
      // lib/planner/generate.ts: `home` comes from owner.home_lat/lng,
      // not from any activity row). Fixed alongside adding that field.
      return {
        error: "Add at least one activity, and set your home address under Settings, to generate a weekend plan.",
      };
    }
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't generate a weekend plan — please try again." }) };
  }

  revalidatePath("/calendar");
  return { error: null };
}
