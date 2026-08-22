"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo, custodyBlocksRepo, eventAttendeesRepo } from "@/lib/db/repositories/calendar";
import { calendarEventInsertSchema, custodyBlockInsertSchema } from "@/lib/db/schemas";
import { generateWeekendPlan } from "@/lib/planner/generate";

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

  const event = await calendarEventsRepo.create(supabase, parsed.data);

  const attendeeIds = formData.getAll("attendeePersonIds").map(String).filter(Boolean);
  await Promise.all(
    attendeeIds.map((personId) =>
      eventAttendeesRepo.create(supabase, { calendar_event_id: event.id, person_id: personId })
    )
  );

  revalidatePath("/calendar");
  redirect("/calendar");
}

export async function createCustodyBlockAction(
  _prevState: CalendarEventFormState,
  formData: FormData
): Promise<CalendarEventFormState> {
  const { supabase, household } = await requireHouseholdContext();

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  const parsed = custodyBlockInsertSchema.safeParse({
    household_id: household.id,
    child_person_id: String(formData.get("childPersonId") ?? ""),
    responsible_person_id: String(formData.get("responsiblePersonId") ?? ""),
    starts_at: new Date(`${startDate}T17:00:00`).toISOString(),
    ends_at: new Date(`${endDate}T17:00:00`).toISOString(),
    block_type: String(formData.get("blockType") ?? "regular"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await custodyBlocksRepo.create(supabase, parsed.data);
  revalidatePath("/calendar");
  redirect("/calendar");
}

export async function deleteCalendarEventAction(eventId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await calendarEventsRepo.remove(supabase, eventId);
  revalidatePath("/calendar");
}

export async function deleteCustodyBlockAction(blockId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await custodyBlocksRepo.remove(supabase, blockId);
  revalidatePath("/calendar");
}

export interface WeekendPlanActionState {
  error: string | null;
}

export async function generateWeekendPlanAction(): Promise<WeekendPlanActionState> {
  const { supabase, household } = await requireHouseholdContext();

  const result = await generateWeekendPlan(supabase, household.id);
  if (result.status === "ai_unavailable" || result.status === "budget_exceeded") {
    return { error: result.reason };
  }
  if (result.status === "no_candidates") {
    return { error: "No activities with a home location configured yet — add one under Activities." };
  }

  revalidatePath("/calendar");
  return { error: null };
}
