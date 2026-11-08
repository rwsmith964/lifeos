"use server";

// Server actions for a person's recurring availability -- "when is she busy"
// (her kids' weeks, no child details needed) and a child's school schedule.
// Returns { error } rather than throwing so the editor can show it inline.
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { availabilitySchedulesRepo } from "@/lib/db/repositories/availability";
import { peopleRepo } from "@/lib/db/repositories/people";
import { availabilityScheduleInputSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";

export interface AvailabilityActionState {
  error: string | null;
}

function revalidateAvailabilitySurfaces(personId: string) {
  revalidatePath(`/people/${personId}`);
  revalidatePath("/calendar");
  revalidatePath("/activities");
  revalidatePath("/");
}

export async function addAvailabilityScheduleAction(personId: string, input: unknown): Promise<AvailabilityActionState> {
  const { supabase, household } = await requireHouseholdContext();

  const person = await peopleRepo.getById(supabase, personId);
  if (!person || person.household_id !== household.id) return { error: "Couldn't find that person." };

  const parsed = availabilityScheduleInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };

  try {
    await availabilitySchedulesRepo.create(supabase, {
      household_id: household.id,
      person_id: personId,
      kind: parsed.data.kind,
      label: parsed.data.label,
      cycle_length_days: parsed.data.cycle_length_days,
      pattern: parsed.data.pattern,
      anchor_date: parsed.data.anchor_date,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date ?? null,
      skip_ranges: parsed.data.skip_ranges,
    });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that schedule — please try again." }) };
  }

  revalidateAvailabilitySurfaces(personId);
  return { error: null };
}

export async function deleteAvailabilityScheduleAction(personId: string, scheduleId: string): Promise<AvailabilityActionState> {
  const { supabase, household } = await requireHouseholdContext();

  const schedule = await availabilitySchedulesRepo.getById(supabase, scheduleId);
  if (!schedule || schedule.household_id !== household.id || schedule.person_id !== personId) {
    return { error: "That schedule was already removed." };
  }

  try {
    await availabilitySchedulesRepo.remove(supabase, scheduleId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that schedule — please try again." }) };
  }

  revalidateAvailabilitySurfaces(personId);
  return { error: null };
}
