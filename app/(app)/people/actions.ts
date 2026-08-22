"use server";

import { redirect } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { peopleRepo } from "@/lib/db/repositories/people";
import { personInsertSchema } from "@/lib/db/schemas";

export interface PersonFormState {
  error: string | null;
}

export async function createPersonAction(
  _prevState: PersonFormState,
  formData: FormData
): Promise<PersonFormState> {
  const { supabase, household } = await requireHouseholdContext();

  const birthdate = String(formData.get("birthdate") ?? "");
  const parsed = personInsertSchema.safeParse({
    household_id: household.id,
    full_name: String(formData.get("fullName") ?? "").trim(),
    nickname: String(formData.get("nickname") ?? "").trim() || null,
    relationship_type: String(formData.get("relationshipType") ?? "friend"),
    birthdate: birthdate || null,
    birth_year_known: formData.get("birthYearKnown") === "on",
    notes: String(formData.get("notes") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const person = await peopleRepo.create(supabase, parsed.data);
  redirect(`/people/${person.id}`);
}
