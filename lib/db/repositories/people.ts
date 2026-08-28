import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  PersonGiftBudgetInsert,
  PersonGiftBudgetRow,
  PersonGiftBudgetUpdate,
  PersonInsert,
  PersonInterestInsert,
  PersonInterestRow,
  PersonInterestUpdate,
  PersonRow,
  PersonUpdate,
} from "../database.types";

export const peopleRepo = createRepository<PersonRow, PersonInsert, PersonUpdate>("people");

export const personInterestsRepo = createRepository<
  PersonInterestRow,
  PersonInterestInsert,
  PersonInterestUpdate
>("person_interests");

export const personGiftBudgetsRepo = createRepository<
  PersonGiftBudgetRow,
  PersonGiftBudgetInsert,
  PersonGiftBudgetUpdate
>("person_gift_budgets");

export async function listPeopleForHousehold(
  client: SupabaseClient,
  householdId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {}
): Promise<PersonRow[]> {
  return peopleRepo.list(client, (q) => {
    let query = q.eq("household_id", householdId);
    if (!includeArchived) query = query.eq("is_archived", false);
    return query.order("full_name", { ascending: true });
  });
}

export async function listInterestsForPerson(
  client: SupabaseClient,
  personId: string
): Promise<PersonInterestRow[]> {
  return personInterestsRepo.list(client, (q) =>
    q.eq("person_id", personId).order("strength", { ascending: false })
  );
}

export async function listBudgetsForPerson(
  client: SupabaseClient,
  personId: string
): Promise<PersonGiftBudgetRow[]> {
  return personGiftBudgetsRepo.list(client, (q) => q.eq("person_id", personId));
}

/**
 * People with a birthdate or anniversary whose month/day falls within the
 * next `horizonDays` (Section 7.1 — the daily occasion scan). Computed in
 * JS against a full household fetch rather than a DB-side query, since
 * "next N days, wrapping past Dec 31" on a month/day-only value isn't a
 * simple range filter — see lib/gifts/scan.ts for the actual date logic.
 */
export async function listPeopleWithKnownDates(
  client: SupabaseClient,
  householdId: string
): Promise<PersonRow[]> {
  return peopleRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .or("birthdate.not.is.null,anniversary.not.is.null")
  );
}

/**
 * People tagged as childcare providers (D-060) — e.g. "my mom" flagged on
 * her existing People record rather than living in a separate contacts
 * list, so she's still tracked normally for birthdays etc. Used by the
 * childcare request form's provider picker.
 */
export async function listChildcareProvidersForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<PersonRow[]> {
  return peopleRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .eq("is_childcare_provider", true)
      .order("full_name", { ascending: true })
  );
}

/**
 * Household children (relationship_type = 'child') for the childcare
 * request form's child picker — same relationship value used elsewhere
 * (e.g. lib/planner/generate.ts) to identify kids vs. other relationships.
 */
export async function listChildrenForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<PersonRow[]> {
  return peopleRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .eq("relationship_type", "child")
      .order("full_name", { ascending: true })
  );
}
