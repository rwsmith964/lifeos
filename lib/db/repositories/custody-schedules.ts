import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  CustodyScheduleExceptionInsert,
  CustodyScheduleExceptionRow,
  CustodyScheduleExceptionUpdate,
  CustodyScheduleInsert,
  CustodyScheduleRow,
  CustodyScheduleUpdate,
} from "../database.types";

export const custodySchedulesRepo = createRepository<
  CustodyScheduleRow,
  CustodyScheduleInsert,
  CustodyScheduleUpdate
>("custody_schedules");

export const custodyScheduleExceptionsRepo = createRepository<
  CustodyScheduleExceptionRow,
  CustodyScheduleExceptionInsert,
  CustodyScheduleExceptionUpdate
>("custody_schedule_exceptions");

export async function listCustodySchedulesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<CustodyScheduleRow[]> {
  return custodySchedulesRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("is_active", true).order("created_at", { ascending: false })
  );
}

export async function listExceptionsForSchedule(
  client: SupabaseClient,
  scheduleId: string
): Promise<CustodyScheduleExceptionRow[]> {
  return custodyScheduleExceptionsRepo.list(client, (q) => q.eq("custody_schedule_id", scheduleId));
}
