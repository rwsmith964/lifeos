"use server";

// Module 1: Relationship & Gift Engine (D-117, relationship_gift_engine_v2
// flag). A separate action file from actions.ts, not edits to it -- every
// action here is entirely new surface area gated behind the flag, so
// nothing in actions.ts needs to change. All writes go through the
// established repository factory (lib/db/repositories/relationship-gift-engine.ts),
// never straight to a table from here.
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import {
  conversationLogEntriesRepo,
  giftReciprocityEntriesRepo,
  momentsRepo,
  personProfileDetailsRepo,
  personRelationshipsRepo,
  personWishlistItemsRepo,
  upsertProfileDetailsForPerson,
} from "@/lib/db/repositories/relationship-gift-engine";
import { peopleRepo } from "@/lib/db/repositories/people";
import {
  conversationLogEntryInsertSchema,
  giftReciprocityEntryInsertSchema,
  momentInsertSchema,
  personProfileDetailsInsertSchema,
  personRelationshipInsertSchema,
  personWishlistItemInsertSchema,
} from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { isFeatureEnabled } from "@/lib/flags";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SimpleFormState {
  error: string | null;
}

const FLAG_OFF_MESSAGE = "The relationship & gift engine isn't turned on for this household yet.";

async function requireEngineEnabled(supabase: SupabaseClient, householdId: string): Promise<string | null> {
  const enabled = await isFeatureEnabled(supabase, householdId, "relationship_gift_engine_v2");
  return enabled ? null : FLAG_OFF_MESSAGE;
}

/** Confirms `personId` actually belongs to the caller's active household before any write -- tenant scoping (Additive Contract §3.7). */
async function assertPersonInHousehold(supabase: SupabaseClient, personId: string, householdId: string): Promise<string | null> {
  const person = await peopleRepo.getById(supabase, personId);
  if (!person || person.household_id !== householdId) return "Person not found.";
  return null;
}

// person_profile_details -----------------------------------------------------

export async function saveProfileDetailsAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  const scopeError = await assertPersonInHousehold(supabase, personId, household.id);
  if (scopeError) return { error: scopeError };

  const toNullableTrimmed = (key: string) => {
    const raw = formData.get(key);
    if (raw == null) return null;
    const trimmed = String(raw).trim();
    return trimmed === "" ? null : trimmed;
  };

  const parsed = personProfileDetailsInsertSchema.safeParse({
    person_id: personId,
    food_preferences: toNullableTrimmed("foodPreferences"),
    clothing_size: toNullableTrimmed("clothingSize"),
    shoe_size: toNullableTrimmed("shoeSize"),
    ring_size: toNullableTrimmed("ringSize"),
    preferred_brands: toNullableTrimmed("preferredBrands"),
    how_we_met: toNullableTrimmed("howWeMet"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const { person_id, ...rest } = parsed.data;
    await upsertProfileDetailsForPerson(supabase, person_id, rest);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save those details — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

// person_wishlist_items -------------------------------------------------------

export async function addWishlistItemAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  const scopeError = await assertPersonInHousehold(supabase, personId, household.id);
  if (scopeError) return { error: scopeError };

  const parsed = personWishlistItemInsertSchema.safeParse({
    person_id: personId,
    item: String(formData.get("item") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    await personWishlistItemsRepo.create(supabase, parsed.data);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't add that item — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

export async function removeWishlistItemAction(personId: string, itemId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  try {
    // A soft "remove" (is_active = false) rather than a hard delete --
    // preserves the history of things once wanted for later gift-idea
    // reference, matching the brief's "reciprocity ledger, not just a
    // snapshot" spirit for gift-adjacent data.
    await personWishlistItemsRepo.update(supabase, itemId, { is_active: false });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that item — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

// person_relationships ---------------------------------------------------------

export async function addPersonRelationshipAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  const scopeError = await assertPersonInHousehold(supabase, personId, household.id);
  if (scopeError) return { error: scopeError };

  const relatedPersonId = String(formData.get("relatedPersonId") ?? "").trim();
  const parsed = personRelationshipInsertSchema.safeParse({
    person_id: personId,
    related_person_id: relatedPersonId || null,
    related_name: String(formData.get("relatedName") ?? ""),
    relation_label: String(formData.get("relationLabel") ?? ""),
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    await personRelationshipsRepo.create(supabase, parsed.data);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that relationship — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

export async function removePersonRelationshipAction(personId: string, relationshipId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  try {
    await personRelationshipsRepo.remove(supabase, relationshipId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that relationship — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

// conversation_log_entries -----------------------------------------------------

export async function addConversationLogEntryAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  const scopeError = await assertPersonInHousehold(supabase, personId, household.id);
  if (scopeError) return { error: scopeError };

  const entryDate = String(formData.get("entryDate") ?? "").trim();
  const parsed = conversationLogEntryInsertSchema.safeParse({
    person_id: personId,
    entry_date: entryDate || undefined,
    content: String(formData.get("content") ?? ""),
    logged_by_person_id: selfPerson.id,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    await conversationLogEntriesRepo.create(supabase, parsed.data);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that note — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

export async function removeConversationLogEntryAction(personId: string, entryId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  try {
    await conversationLogEntriesRepo.remove(supabase, entryId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that note — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

// moments -----------------------------------------------------------------------

export async function addMomentAction(_prevState: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };

  const participantIds = formData.getAll("participantPersonIds").map((v) => String(v));
  const parsed = momentInsertSchema.safeParse({
    household_id: household.id,
    title: String(formData.get("title") ?? ""),
    occurred_on: String(formData.get("occurredOn") ?? ""),
    place: String(formData.get("place") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    participant_person_ids: participantIds,
    created_by_person_id: selfPerson.id,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    await momentsRepo.create(supabase, parsed.data);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that moment — please try again." }) };
  }
  revalidatePath("/people");
  for (const personId of participantIds) revalidatePath(`/people/${personId}`);
  return { error: null };
}

export async function removeMomentAction(momentId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  try {
    await momentsRepo.remove(supabase, momentId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that moment — please try again." }) };
  }
  revalidatePath("/people");
  return { error: null };
}

// gift_reciprocity_entries -------------------------------------------------------

export async function addReciprocityEntryAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  const scopeError = await assertPersonInHousehold(supabase, personId, household.id);
  if (scopeError) return { error: scopeError };

  const isPromise = formData.get("isPromise") === "on";
  const occasionType = String(formData.get("occasionType") ?? "").trim();
  const parsed = giftReciprocityEntryInsertSchema.safeParse({
    household_id: household.id,
    person_id: personId,
    direction: String(formData.get("direction") ?? ""),
    description: String(formData.get("description") ?? ""),
    occasion_type: occasionType || null,
    occurred_on: String(formData.get("occurredOn") ?? "").trim() || null,
    is_promise: isPromise,
    promise_due_date: isPromise ? String(formData.get("promiseDueDate") ?? "").trim() || null : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    await giftReciprocityEntriesRepo.create(supabase, parsed.data);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that entry — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

/** Marks an outstanding promise fulfilled (undo: fulfillReciprocityEntryAction is idempotent-safe to re-call with an earlier date). */
export async function fulfillReciprocityEntryAction(personId: string, entryId: string): Promise<SimpleFormState> {
  const { supabase, household, timezone } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  try {
    // D-143: household-local today, not a bare `new Date()` -- see
    // lib/timezones.ts's getZonedNow for why.
    await giftReciprocityEntriesRepo.update(supabase, entryId, {
      fulfilled_at: getZonedNow(timezone).toISOString().slice(0, 10),
    });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't update that — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

/** Undo for fulfillReciprocityEntryAction -- every async action needs undo where possible. */
export async function unfulfillReciprocityEntryAction(personId: string, entryId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  try {
    await giftReciprocityEntriesRepo.update(supabase, entryId, { fulfilled_at: null });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't update that — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

export async function removeReciprocityEntryAction(personId: string, entryId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requireEngineEnabled(supabase, household.id);
  if (flagError) return { error: flagError };
  try {
    await giftReciprocityEntriesRepo.remove(supabase, entryId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that entry — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

// Re-exported so a future settings/admin surface can read raw rows without
// importing the repository module directly (mirrors how actions.ts re-exports
// repos indirectly via its own imports elsewhere in the app).
export { personProfileDetailsRepo };
