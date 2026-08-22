"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo } from "@/lib/db/repositories/calendar";
import { calendarEventInsertSchema } from "@/lib/db/schemas";

export interface CalendarEventFormState {
  error: string | null;
}

export async function createCalendarEventAction(
  _prevState: CalendarEventFormState,
  formData: FormData
): Promise<CalendarEventFormState> {
  const { supabase, household, selfPerson } = await requireHouseholdContext();

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "09:00");
  const endTime = String(formData.get("endTime") ?? "10:00");
  const allDay = formData.get("allDay") === "on";

  const startsAt = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`;
  const endsAt = allDay ? `${date}T23:59:59` : `${date}T${endTime}:00`;

  const parsed = calendarEventInsertSchema.safeParse({
    household_id: household.id,
    created_by_person_id: selfPerson.id,
    title: String(formData.get("title") ?? "").trim(),
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    all_day: allDay,
    location: String(formData.get("location") ?? "").trim() || null,
    event_type: String(formData.get("eventType") ?? "personal"),
    visibility: String(formData.get("visibility") ?? "private"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await calendarEventsRepo.create(supabase, parsed.data);
  revalidatePath("/calendar");
  redirect("/calendar");
}
