import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  ContactCadenceInsert,
  ContactCadenceRow,
  ContactCadenceUpdate,
  ContactType,
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

// P0-5 fix: previously joined on people!inner(household_id) only, with no
// is_archived check on the joined person. A cadence row left pointing at
// an archived/test person (e.g. an archived "ZZ Brief TestFriend" row)
// still came back here as "active," and since that person no longer shows
// up in listPeopleForHousehold's peopleById map, generate.ts's lookup
// silently fell back to the literal string "someone" in the brief output.
// Filtering on person.is_archived = false here means an active cadence
// can now only ever resolve to a person who still exists in a caller's
// own peopleById map, since both queries share the same is_archived
// condition.
export async function listActiveCadencesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<(ContactCadenceRow & { person_id: string })[]> {
  const { data, error } = await client
    .from("contact_cadences")
    .select("*, person:people!inner(household_id, is_archived)")
    .eq("person.household_id", householdId)
    .eq("person.is_archived", false)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as (ContactCadenceRow & { person_id: string })[];
}

/**
 * Keeps contact_cadences.last_contact_date/last_contact_type in sync with
 * the interactions log. Logging an interaction and evaluating cadence
 * status read from two different tables that nothing wired together —
 * cadence status ("Overdue") never reflected a contact logged the same
 * day, even though it appeared right below in the interaction history.
 * See DECISIONS.md D-032. No-op if the person has no cadence row (nothing
 * to keep in sync) or if a newer contact is already recorded.
 */
export async function recordContactForCadence(
  client: SupabaseClient,
  personId: string,
  occurredOn: string,
  interactionType: ContactType
): Promise<void> {
  const cadence = await getCadenceForPerson(client, personId);
  if (!cadence) return;
  if (cadence.last_contact_date && cadence.last_contact_date >= occurredOn) return;
  await contactCadencesRepo.update(client, cadence.id, {
    last_contact_date: occurredOn,
    last_contact_type: interactionType,
  });
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
