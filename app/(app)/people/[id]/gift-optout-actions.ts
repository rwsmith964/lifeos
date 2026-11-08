"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { peopleRepo } from "@/lib/db/repositories/people";
import { friendlyMutationError } from "@/lib/db/errors";

export interface GiftOptOutResult {
  error: string | null;
}

/** "We don't get gifts for this person" (enabled = false) or back on again. */
export async function setGiftsEnabledAction(personId: string, enabled: boolean): Promise<GiftOptOutResult> {
  if (!z.string().uuid().safeParse(personId).success) return { error: "That person wasn't found." };
  const { supabase, household } = await requireHouseholdContext();
  try {
    const person = await peopleRepo.getById(supabase, personId);
    if (!person || person.household_id !== household.id) return { error: "That person wasn't found." };
    await peopleRepo.update(supabase, personId, { gifts_enabled: enabled });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that — please try again." }) };
  }
  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  revalidatePath("/gifts");
  revalidatePath("/");
  return { error: null };
}
