// D-129: child-activity infrastructure (day/time/location + per-adult
// mandatory/optional attendance). See supabase/migrations/
// 20260902000003_child_activities.sql for the full design rationale.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  ChildActivityAttendanceInsert,
  ChildActivityAttendanceRow,
  ChildActivityAttendanceUpdate,
  ChildActivityInsert,
  ChildActivityRow,
  ChildActivityUpdate,
} from "../database.types";

export const childActivitiesRepo = createRepository<ChildActivityRow, ChildActivityInsert, ChildActivityUpdate>(
  "child_activities"
);

export const childActivityAttendanceRepo = createRepository<
  ChildActivityAttendanceRow,
  ChildActivityAttendanceInsert,
  ChildActivityAttendanceUpdate
>("child_activity_attendance");

export async function listChildActivitiesForChild(
  client: SupabaseClient,
  childPersonId: string
): Promise<ChildActivityRow[]> {
  return childActivitiesRepo.list(client, (q) =>
    q
      .eq("child_person_id", childPersonId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true })
  );
}

/** Every child_activities row for the household — used by the main calendar's future materializer and by any household-wide activity list. */
export async function listChildActivitiesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<ChildActivityRow[]> {
  return childActivitiesRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true })
  );
}

export async function listAttendanceForActivities(
  client: SupabaseClient,
  childActivityIds: string[]
): Promise<Map<string, ChildActivityAttendanceRow[]>> {
  const byActivity = new Map<string, ChildActivityAttendanceRow[]>();
  if (childActivityIds.length === 0) return byActivity;
  const rows = await childActivityAttendanceRepo.list(client, (q) => q.in("child_activity_id", childActivityIds));
  for (const row of rows) {
    const existing = byActivity.get(row.child_activity_id) ?? [];
    existing.push(row);
    byActivity.set(row.child_activity_id, existing);
  }
  return byActivity;
}

/**
 * Replaces every attendance row for one activity with the given set in a
 * single pass — simplest correct semantics for a small per-activity form
 * (a handful of household adults) where "delete the ones removed, upsert
 * the ones kept/added" would need the same read-then-diff the caller
 * already has to do to build `entries` in the first place.
 */
export async function setAttendanceForActivity(
  client: SupabaseClient,
  childActivityId: string,
  entries: { personId: string; attendanceStatus: ChildActivityAttendanceRow["attendance_status"] }[]
): Promise<void> {
  const { error: deleteError } = await client
    .from("child_activity_attendance")
    .delete()
    .eq("child_activity_id", childActivityId);
  if (deleteError) throw deleteError;
  if (entries.length === 0) return;
  const { error: insertError } = await client.from("child_activity_attendance").insert(
    entries.map((e) => ({
      child_activity_id: childActivityId,
      person_id: e.personId,
      attendance_status: e.attendanceStatus,
    }))
  );
  if (insertError) throw insertError;
}
