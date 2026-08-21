import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  ContactCadenceInsert,
  ContactCadenceRow,
  ContactCadenceUpdate,
  InteractionInsert,
  InteractionRow,
  InteractionUpdate,
} from "../database.types";

export const contactCadencesRepo = createRepository<
  ContactCadenceRow,
  ContactCadenceInsert,
  ContactCadenceUpdate
>("contact_cadences");

export const interactionsRepo = createRepository<
  InteractionRow,
  InteractionInsert,
  InteractionUpdate
>("interactions");

export async function getCadenceForPerson(
  client: SupabaseClient,
  personId: string
): Promise<ContactCadenceRow | null> {
  const rows = await contactCadencesRepo.list(client, (q) => q.eq("person_id", personId).limit(1));
  return rows[0] ?? null;
}

export async function listActiveCadencesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<(ContactCadenceRow & { person_id: string })[]> {
  const { data, error } = await client
    .from("contact_cadences")
    .select("*, person:people!inner(household_id)")
    .eq("person.household_id", householdId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as (ContactCadenceRow & { person_id: string })[];
}

export async function listInteractionsForPerson(
  client: SupabaseClient,
  personId: string,
  limit = 10
): Promise<InteractionRow[]> {
  return interactionsRepo.list(client, (q) =>
    q.eq("person_id", personId).order("occurred_on", { ascending: false }).limit(limit)
  );
}
