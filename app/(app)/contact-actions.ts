"use server";

// "I reached out to this person" -- used by both the Today reach-out tile and
// the person profile (components/people/log-contact-control.tsx), so the two
// can never disagree about what logging a contact does. Returns { error }
// instead of throwing: a thrown Server Action error surfaced as nothing at
// all on the old profile button, which is exactly how a failed save looked
// identical to a working one.
import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { logContact, undoLogContact, type LogContactResult } from "@/lib/contact/log-contact";
import type { ContactType } from "@/lib/db/database.types";
import { contactTypeSchema } from "@/lib/db/schemas";

function revalidateContactSurfaces(personId: string) {
  revalidatePath("/");
  revalidatePath("/people");
  revalidatePath(`/people/${personId}`);
}

export async function logContactAction(
  personId: string,
  type: ContactType = "text",
  occurredOn?: string | null
): Promise<LogContactResult> {
  const { supabase, household, timezone } = await requireHouseholdContext();

  const parsedType = contactTypeSchema.safeParse(type);
  if (!parsedType.success) return { error: "Pick how you got in touch." };

  const result = await logContact(supabase, {
    householdId: household.id,
    personId,
    type: parsedType.data,
    occurredOn,
    todayLocal: format(getZonedNow(timezone), "yyyy-MM-dd"),
  });
  if (!result.error) revalidateContactSurfaces(personId);
  return result;
}

export async function undoLogContactAction(
  personId: string,
  interactionId: string,
  previousLastContactDate: string | null,
  previousLastContactType: ContactType | null
): Promise<{ error: string | null }> {
  const { supabase, household } = await requireHouseholdContext();
  const result = await undoLogContact(supabase, {
    householdId: household.id,
    personId,
    interactionId,
    previousLastContactDate,
    previousLastContactType,
  });
  if (!result.error) revalidateContactSurfaces(personId);
  return result;
}
