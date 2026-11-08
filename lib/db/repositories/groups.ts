import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { PersonGroupInsert, PersonGroupRow, PersonGroupUpdate } from "../database.types";

export const personGroupsRepo = createRepository<PersonGroupRow, PersonGroupInsert, PersonGroupUpdate>("person_groups");

export async function listGroupsForHousehold(client: SupabaseClient, householdId: string): Promise<PersonGroupRow[]> {
  return personGroupsRepo.list(client, (q) => q.eq("household_id", householdId).order("name", { ascending: true }));
}
