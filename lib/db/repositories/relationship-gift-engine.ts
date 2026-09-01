// Module 1: Relationship & Gift Engine (D-117, relationship_gift_engine_v2
// flag) -- repository layer for the six new tables added by
// supabase/migrations/20260901000002_module1_relationship_gift_engine.sql.
// Every function here is additive: nothing in this file is called by any
// existing route/action, so it has zero effect on current behavior until
// a flagged caller uses it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  ConversationLogEntryInsert,
  ConversationLogEntryRow,
  ConversationLogEntryUpdate,
  GiftReciprocityEntryInsert,
  GiftReciprocityEntryRow,
  GiftReciprocityEntryUpdate,
  MomentInsert,
  MomentRow,
  MomentUpdate,
  PersonProfileDetailsInsert,
  PersonProfileDetailsRow,
  PersonProfileDetailsUpdate,
  PersonRelationshipInsert,
  PersonRelationshipRow,
  PersonRelationshipUpdate,
  PersonWishlistItemInsert,
  PersonWishlistItemRow,
  PersonWishlistItemUpdate,
} from "../database.types";

export const personProfileDetailsRepo = createRepository<
  PersonProfileDetailsRow,
  PersonProfileDetailsInsert,
  PersonProfileDetailsUpdate
>("person_profile_details");

export const personWishlistItemsRepo = createRepository<
  PersonWishlistItemRow,
  PersonWishlistItemInsert,
  PersonWishlistItemUpdate
>("person_wishlist_items");

export const personRelationshipsRepo = createRepository<
  PersonRelationshipRow,
  PersonRelationshipInsert,
  PersonRelationshipUpdate
>("person_relationships");

export const conversationLogEntriesRepo = createRepository<
  ConversationLogEntryRow,
  ConversationLogEntryInsert,
  ConversationLogEntryUpdate
>("conversation_log_entries");

export const momentsRepo = createRepository<MomentRow, MomentInsert, MomentUpdate>("moments");

export const giftReciprocityEntriesRepo = createRepository<
  GiftReciprocityEntryRow,
  GiftReciprocityEntryInsert,
  GiftReciprocityEntryUpdate
>("gift_reciprocity_entries");

/** One extended-profile row per person, or null if none has been added yet. */
export async function getProfileDetailsForPerson(
  client: SupabaseClient,
  personId: string
): Promise<PersonProfileDetailsRow | null> {
  const { data, error } = await client
    .from("person_profile_details")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return data as PersonProfileDetailsRow | null;
}

/** Create-or-update the single profile-details row for a person (mirrors the upsert-by-existence pattern in people/[id]/actions.ts's setCadenceAction). */
export async function upsertProfileDetailsForPerson(
  client: SupabaseClient,
  personId: string,
  values: Omit<PersonProfileDetailsInsert, "person_id">
): Promise<PersonProfileDetailsRow> {
  return personProfileDetailsRepo.upsert(client, { person_id: personId, ...values }, "person_id");
}

export async function listWishlistItemsForPerson(
  client: SupabaseClient,
  personId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {}
): Promise<PersonWishlistItemRow[]> {
  return personWishlistItemsRepo.list(client, (q) => {
    let query = q.eq("person_id", personId);
    if (!includeInactive) query = query.eq("is_active", true);
    return query.order("noted_at", { ascending: false });
  });
}

export async function listRelationshipsForPerson(
  client: SupabaseClient,
  personId: string
): Promise<PersonRelationshipRow[]> {
  return personRelationshipsRepo.list(client, (q) => q.eq("person_id", personId).order("created_at", { ascending: true }));
}

export async function listConversationLogForPerson(
  client: SupabaseClient,
  personId: string,
  limit = 20
): Promise<ConversationLogEntryRow[]> {
  return conversationLogEntriesRepo.list(client, (q) =>
    q.eq("person_id", personId).order("entry_date", { ascending: false }).limit(limit)
  );
}

export async function listMomentsForHousehold(
  client: SupabaseClient,
  householdId: string,
  limit = 50
): Promise<MomentRow[]> {
  return momentsRepo.list(client, (q) =>
    q.eq("household_id", householdId).order("occurred_on", { ascending: false }).limit(limit)
  );
}

/** Moments a given person participated in, newest first -- for a person-detail "shared moments" card. */
export async function listMomentsForPerson(
  client: SupabaseClient,
  householdId: string,
  personId: string
): Promise<MomentRow[]> {
  return momentsRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .contains("participant_person_ids", [personId])
      .order("occurred_on", { ascending: false })
  );
}

export async function listReciprocityEntriesForPerson(
  client: SupabaseClient,
  personId: string
): Promise<GiftReciprocityEntryRow[]> {
  return giftReciprocityEntriesRepo.list(client, (q) =>
    q.eq("person_id", personId).order("created_at", { ascending: false })
  );
}

export async function listOutstandingPromisesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<GiftReciprocityEntryRow[]> {
  return giftReciprocityEntriesRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .eq("is_promise", true)
      .is("fulfilled_at", null)
      .order("promise_due_date", { ascending: true })
  );
}
