import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { AvailabilityScheduleInsert, AvailabilityScheduleRow, AvailabilityScheduleUpdate } from "../database.types";

export const availabilitySchedulesRepo = createRepository<
  AvailabilityScheduleRow,
  AvailabilityScheduleInsert,
  AvailabilityScheduleUpdate
>("availability_schedules");

export async function listAvailabilitySchedulesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<AvailabilityScheduleRow[]> {
  return availabilitySchedulesRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("is_active", true).order("created_at", { ascending: true })
  );
}

export async function listAvailabilitySchedulesForPerson(
  client: SupabaseClient,
  personId: string
): Promise<AvailabilityScheduleRow[]> {
  return availabilitySchedulesRepo.list(client, (q) =>
    q.eq("person_id", personId).eq("is_active", true).order("created_at", { ascending: true })
  );
}
