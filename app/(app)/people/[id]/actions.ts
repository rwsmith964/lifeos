"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { peopleRepo, personInterestsRepo, personGiftBudgetsRepo } from "@/lib/db/repositories/people";
import { giftsRepo } from "@/lib/db/repositories/gifts";
import {
  contactCadencesRepo,
  interactionsRepo,
  getCadenceForPerson,
  recordContactForCadence,
} from "@/lib/db/repositories/contact";
import {
  personInterestInsertSchema,
  personGiftBudgetInsertSchema,
  giftInsertSchema,
  contactCadenceInsertSchema,
  interactionInsertSchema,
} from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { applyGiftFeedback } from "@/lib/gifts/feedback";
import { generateGiftSuggestions } from "@/lib/gifts/suggest";
import type { OccasionType } from "@/lib/db/database.types";

export interface SimpleFormState {
  error: string | null;
}

export interface GenerateSuggestionsState {
  error: string | null;
  success: boolean;
}

export async function generateSuggestionsAction(
  personId: string,
  _prevState: GenerateSuggestionsState,
  formData: FormData
): Promise<GenerateSuggestionsState> {
  const { supabase, household } = await requireHouseholdContext();

  const occasionType = String(formData.get("occasionType") ?? "just_because") as OccasionType;
  const occasionDateStr = String(formData.get("occasionDate") ?? "");
  const occasionDate = occasionDateStr ? new Date(`${occasionDateStr}T00:00:00`) : new Date();

  const result = await generateGiftSuggestions(supabase, {
    householdId: household.id,
    personId,
    occasionType,
    occasionDate,
  });

  if (result.status === "ai_unavailable" || result.status === "budget_exceeded") {
    return { error: result.reason, success: false };
  }
  if (result.status === "parse_failed") {
    return { error: "Couldn't parse a suggestion this time — try again.", success: false };
  }

  revalidatePath("/gifts");
  return { error: null, success: true };
}

export async function addInterestAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase } = await requireHouseholdContext();

  const parsed = personInterestInsertSchema.safeParse({
    person_id: personId,
    interest: String(formData.get("interest") ?? ""),
    category: String(formData.get("category") ?? "").trim() || null,
    strength: String(formData.get("strength") ?? "casual"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    // Upsert, not insert: re-adding an interest the person already has
    // (person_id, interest) is a unique constraint, and previously an
    // uncaught violation here crashed the whole app (D-032). Re-adding is
    // a normal thing to do — treat it as "update the strength" rather
    // than an error.
    await personInterestsRepo.upsert(supabase, parsed.data, "person_id,interest");
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't add that interest — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

export async function addBudgetAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase } = await requireHouseholdContext();

  const parsed = personGiftBudgetInsertSchema.safeParse({
    person_id: personId,
    occasion_type: String(formData.get("occasionType") ?? "default"),
    min_cents: Math.round(Number(formData.get("minDollars") ?? 0) * 100),
    max_cents: Math.round(Number(formData.get("maxDollars") ?? 0) * 100),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    // Same reasoning as addInterestAction: (person_id, occasion_type) is
    // unique, and re-setting a budget for an occasion that already has one
    // should replace it, not crash.
    await personGiftBudgetsRepo.upsert(supabase, parsed.data, "person_id,occasion_type");
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that budget — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

export async function recordGiftAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase } = await requireHouseholdContext();

  const reaction = String(formData.get("reaction") ?? "");
  const parsed = giftInsertSchema.safeParse({
    person_id: personId,
    occasion_type: String(formData.get("occasionType") ?? "just_because"),
    occasion_date: String(formData.get("occasionDate") ?? ""),
    description: String(formData.get("description") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    cost_cents: formData.get("costDollars") ? Math.round(Number(formData.get("costDollars")) * 100) : null,
    status: "given",
    reaction: reaction || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const gift = await giftsRepo.create(supabase, parsed.data);
    if (gift.reaction) {
      await applyGiftFeedback(supabase, gift.id);
    }
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't record that gift — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

export async function setCadenceAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase } = await requireHouseholdContext();

  const targetDays = Number(formData.get("targetIntervalDays") ?? 30);
  const parsed = contactCadenceInsertSchema.safeParse({
    person_id: personId,
    target_interval_days: targetDays,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const existing = await getCadenceForPerson(supabase, personId);
    if (existing) {
      await contactCadencesRepo.update(supabase, existing.id, { target_interval_days: targetDays });
    } else {
      await contactCadencesRepo.create(supabase, parsed.data);
    }
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

export async function logInteractionAction(personId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();

  const occurredOn = new Date().toISOString().slice(0, 10);
  const parsed = interactionInsertSchema.parse({
    person_id: personId,
    interaction_type: "in_person",
    occurred_on: occurredOn,
  });
  await interactionsRepo.create(supabase, parsed);
  await recordContactForCadence(supabase, personId, occurredOn, "in_person");
  revalidatePath(`/people/${personId}`);
}

export async function updatePersonAction(
  personId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();

  const existing = await peopleRepo.getById(supabase, personId);
  if (!existing || existing.household_id !== household.id) {
    return { error: "Person not found." };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) return { error: "Full name is required." };

  const birthdate = String(formData.get("birthdate") ?? "");
  if (birthdate && birthdate > new Date().toISOString().slice(0, 10)) {
    return { error: "Birthdate can't be in the future." };
  }

  try {
    await peopleRepo.update(supabase, personId, {
      full_name: fullName,
      nickname: String(formData.get("nickname") ?? "").trim() || null,
      relationship_type: existing.relationship_type === "self" ? "self" : (String(formData.get("relationshipType") ?? existing.relationship_type) as typeof existing.relationship_type),
      birthdate: birthdate || null,
      birth_year_known: formData.get("birthYearKnown") === "on",
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? ""),
    });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save those changes — please try again." }) };
  }

  revalidatePath(`/people/${personId}`);
  redirect(`/people/${personId}`);
}

export async function deleteInterestAction(personId: string, interestId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await personInterestsRepo.remove(supabase, interestId);
  revalidatePath(`/people/${personId}`);
}

export async function deleteBudgetAction(personId: string, budgetId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await personGiftBudgetsRepo.remove(supabase, budgetId);
  revalidatePath(`/people/${personId}`);
}

export async function deleteGiftAction(personId: string, giftId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await giftsRepo.remove(supabase, giftId);
  revalidatePath(`/people/${personId}`);
}

export async function archivePersonAction(personId: string): Promise<void> {
  const { supabase, household } = await requireHouseholdContext();

  const existing = await peopleRepo.getById(supabase, personId);
  if (!existing || existing.household_id !== household.id || existing.relationship_type === "self") {
    return;
  }

  await peopleRepo.update(supabase, personId, { is_archived: true });
  revalidatePath("/people");
  redirect("/people");
}
