import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  CustodyScheduleExceptionInsert,
  CustodyScheduleExceptionRow,
  CustodyScheduleExceptionUpdate,
  CustodyScheduleInsert,
  CustodyScheduleRow,
  CustodyScheduleRuleInsert,
  CustodyScheduleRuleRow,
  CustodyScheduleRuleUpdate,
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

export const custodyScheduleRulesRepo = createRepository<
  CustodyScheduleRuleRow,
  CustodyScheduleRuleInsert,
  CustodyScheduleRuleUpdate
>("custody_schedule_rules");

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

/** Repeating variations ("first Saturday of the month") for a schedule, in a stable order so precedence between overlapping rules is deterministic. */
export async function listRulesForSchedule(client: SupabaseClient, scheduleId: string): Promise<CustodyScheduleRuleRow[]> {
  return custodyScheduleRulesRepo.list(client, (q) =>
    q.eq("custody_schedule_id", scheduleId).order("created_at", { ascending: true })
  );
}
