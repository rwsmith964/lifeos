"use server";

// Accept or dismiss a suggested travel/prep block. Accepting turns it into a
// normal, editable, deletable calendar event; dismissing remembers the choice
// so it never comes back. Suggestions themselves are never stored.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo } from "@/lib/db/repositories/calendar";
import { setItemDismissal } from "@/lib/db/repositories/today-dismissals";
import { friendlyMutationError } from "@/lib/db/errors";
import { suggestionExternalId, suggestionKey, SUGGESTION_SOURCE } from "@/lib/calendar/suggestions";
import { SUGGESTION_DISMISSED_UNTIL } from "@/lib/calendar/suggestions-server";

const inputSchema = z.object({
  kind: z.enum(["travel", "prep"]),
  eventId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  detail: z.string().max(500),
  startsAtISO: z.string().datetime(),
  endsAtISO: z.string().datetime(),
});
export type AcceptSuggestionInput = z.infer<typeof inputSchema>;

export interface SuggestionActionResult {
  error: string | null;
}

export async function acceptSuggestionAction(raw: AcceptSuggestionInput): Promise<SuggestionActionResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { error: "That suggestion looks out of date — refresh and try again." };
  const input = parsed.data;
  if (new Date(input.endsAtISO) <= new Date(input.startsAtISO)) {
    return { error: "That suggestion looks out of date — refresh and try again." };
  }

  const { supabase, household, selfPerson } = await requireHouseholdContext();
  try {
    const source = await calendarEventsRepo.getById(supabase, input.eventId);
    if (!source || source.household_id !== household.id) return { error: "That event no longer exists." };

    await calendarEventsRepo.create(supabase, {
      household_id: household.id,
      created_by_person_id: selfPerson.id,
      title: input.title,
      description: input.detail,
      starts_at: input.startsAtISO,
      ends_at: input.endsAtISO,
      all_day: false,
      event_type: input.kind === "travel" ? "travel" : "prep",
      external_source: SUGGESTION_SOURCE,
      external_id: suggestionExternalId(input.kind, input.eventId),
    });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't add that — please try again." }) };
  }
  revalidatePath("/calendar");
  return { error: null };
}

export async function dismissSuggestionAction(kind: "travel" | "prep", eventId: string): Promise<SuggestionActionResult> {
  if ((kind !== "travel" && kind !== "prep") || !z.string().uuid().safeParse(eventId).success) {
    return { error: "That suggestion looks out of date — refresh and try again." };
  }
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  try {
    await setItemDismissal(supabase, {
      householdId: household.id,
      personId: selfPerson.id,
      itemKey: suggestionKey(kind, eventId),
      hiddenUntil: SUGGESTION_DISMISSED_UNTIL,
    });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't dismiss that — please try again." }) };
  }
  revalidatePath("/calendar");
  return { error: null };
}
