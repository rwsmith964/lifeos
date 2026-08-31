"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { createHouseholdWithOwner } from "@/lib/db/repositories/households";
import { peopleRepo } from "@/lib/db/repositories/people";

export interface OnboardingState {
  error: string | null;
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

  const household = await createHouseholdWithOwner(supabase, user.id, householdName);
  await peopleRepo.create(supabase, {
    household_id: household.id,
    user_id: user.id,
    full_name: fullName,
    relationship_type: "self",
    // D-091: carry the auth email onto the self person record so email
    // notifications (Settings > Notification delivery) have somewhere to
    // go for the account owner, same as any other household member.
    email: user.email ?? null,
    // D-068: self's own work schedule showing on their own calendar is the
    // obviously-wanted default; every other person starts opted out.
    show_work_schedule_on_calendar: true,
  });

  redirect("/");
}
