"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { createHouseholdWithOwner } from "@/lib/db/repositories/households";
import { peopleRepo } from "@/lib/db/repositories/people";

export interface OnboardingState {
  error: string | null;
  // D-141: the household-creation step used to redirect straight to "/" —
  // now it hands the newly-created self person back to the client wizard
  // instead, so the questionnaire's later steps (work schedule, interests)
  // can run for "self" the same way they run for every other household
  // member, before the user ever lands on the dashboard.
  selfPersonId?: string;
  selfFullName?: string;
}

export async function createHouseholdAction(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdName = String(formData.get("householdName") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!householdName || !fullName) {
    return { error: "Both fields are required." };
  }

  const birthdate = String(formData.get("birthdate") ?? "").trim();
  if (birthdate && birthdate > new Date().toISOString().slice(0, 10)) {
    return { error: "Birthdate can't be in the future." };
  }

  const household = await createHouseholdWithOwner(supabase, user.id, householdName);
  const self = await peopleRepo.create(supabase, {
    household_id: household.id,
    user_id: user.id,
    full_name: fullName,
    relationship_type: "self",
    birthdate: birthdate || null,
    birth_year_known: formData.get("birthYearKnown") === "on",
    // D-091: carry the auth email onto the self person record so email
    // notifications (Settings > Notification delivery) have somewhere to
    // go for the account owner, same as any other household member.
    email: user.email ?? null,
    // D-068: self's own work schedule showing on their own calendar is the
    // obviously-wanted default; every other person starts opted out.
    show_work_schedule_on_calendar: true,
  });

  return { error: null, selfPersonId: self.id, selfFullName: self.full_name };
}
