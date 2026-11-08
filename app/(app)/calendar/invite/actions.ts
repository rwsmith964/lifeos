"use server";

// Confirms an invitation the person has reviewed: creates the calendar event,
// links the people they said were invited, and -- only for the follow-up
// questions they answered yes to -- an RSVP reminder and a gift idea carrying
// the registry details. Nothing is written until this runs.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo, eventAttendeesRepo } from "@/lib/db/repositories/calendar";
import { giftsRepo } from "@/lib/db/repositories/gifts";
import { peopleRepo, listPeopleForHousehold } from "@/lib/db/repositories/people";
import { calendarEventTypeSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { floatingIso } from "@/lib/custody/materialize";
import { coordinatesForLocation } from "@/lib/calendar/geocode-event";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const inviteEventInputSchema = z.object({
  title: z.string().trim().min(1, "Give the event a title."),
  date: isoDate,
  startTime: hhmm.nullable(),
  endTime: hhmm.nullable(),
  allDay: z.boolean(),
  location: z.string().trim().nullable(),
  description: z.string().nullable(),
  eventType: calendarEventTypeSchema,
  attendeePersonIds: z.array(z.string().uuid()),
  rsvp: z.object({ date: isoDate, title: z.string().trim().min(1) }).nullable(),
  gift: z
    .object({
      /** An existing person, or a new friend to add (the host/honoree who isn't in People yet). */
      personId: z.string().uuid().nullable(),
      newPersonName: z.string().trim().min(1).nullable(),
      description: z.string().trim().min(1),
      notes: z.string(),
      productUrl: z.string().url().nullable(),
    })
    .nullable(),
});
export type InviteEventInput = z.infer<typeof inviteEventInputSchema>;

export interface InviteEventResult {
  error: string | null;
  eventId?: string;
  addedRsvpReminder?: boolean;
  addedGiftFor?: string | null;
}

export async function createEventFromInviteAction(rawInput: InviteEventInput): Promise<InviteEventResult> {
  const parsed = inviteEventInputSchema.safeParse(rawInput);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Some details are missing." };
  const input = parsed.data;
  if (!input.allDay && !input.startTime) return { error: "Choose a start time, or mark it all day." };

  const { supabase, household, selfPerson } = await requireHouseholdContext();

  try {
    const startsAt = input.allDay ? `${input.date}T00:00:00` : `${input.date}T${input.startTime}:00`;
    // No end printed: a 2-hour block rather than an instant. Wall-clock times
    // are stored "floating" like every other calendar item (see floatingIso).
    const endsAt = input.allDay
      ? `${input.date}T23:59:59`
      : `${input.date}T${input.endTime ?? addHours(input.startTime as string, 2)}:00`;
    const startsIso = floatingIso(startsAt);
    let endsIso = floatingIso(endsAt);
    if (new Date(endsIso) < new Date(startsIso)) endsIso = startsIso;

    const coords = await coordinatesForLocation(input.location);
    const event = await calendarEventsRepo.create(supabase, {
      household_id: household.id,
      created_by_person_id: selfPerson.id,
      title: input.title,
      description: input.description,
      starts_at: startsIso,
      ends_at: endsIso,
      all_day: input.allDay,
      location: input.location || null,
      location_lat: coords?.lat ?? null,
      location_lng: coords?.lng ?? null,
      event_type: input.eventType,
    });

    // Only people who really belong to this household can be linked.
    const householdPeople = await listPeopleForHousehold(supabase, household.id);
    const validIds = new Set(householdPeople.map((p) => p.id));
    const attendeeIds = [...new Set(input.attendeePersonIds)].filter((id) => validIds.has(id) && id !== selfPerson.id);
    if (attendeeIds.length > 0) {
      await eventAttendeesRepo.createMany(
        supabase,
        attendeeIds.map((personId) => ({ calendar_event_id: event.id, person_id: personId }))
      );
    }

    let addedRsvpReminder = false;
    if (input.rsvp) {
      await calendarEventsRepo.create(supabase, {
        household_id: household.id,
        created_by_person_id: selfPerson.id,
        title: input.rsvp.title,
        starts_at: floatingIso(`${input.rsvp.date}T00:00:00`),
        ends_at: floatingIso(`${input.rsvp.date}T23:59:59`),
        all_day: true,
        event_type: "personal",
      });
      addedRsvpReminder = true;
    }

    let addedGiftFor: string | null = null;
    if (input.gift) {
      let giftPersonId = input.gift.personId && validIds.has(input.gift.personId) ? input.gift.personId : null;
      let giftPersonLabel: string | null = giftPersonId
        ? (householdPeople.find((p) => p.id === giftPersonId)?.nickname ||
            householdPeople.find((p) => p.id === giftPersonId)?.full_name ||
            null)
        : null;
      if (!giftPersonId && input.gift.newPersonName) {
        const created = await peopleRepo.create(supabase, {
          household_id: household.id,
          full_name: input.gift.newPersonName,
          relationship_type: "friend",
        });
        giftPersonId = created.id;
        giftPersonLabel = created.full_name;
      }
      if (giftPersonId) {
        await giftsRepo.create(supabase, {
          person_id: giftPersonId,
          occasion_type: "default",
          occasion_date: input.date,
          description: input.gift.description,
          status: "idea",
          product_url: input.gift.productUrl,
          notes: input.gift.notes,
        });
        addedGiftFor = giftPersonLabel;
      }
    }

    revalidatePath("/calendar");
    revalidatePath("/gifts");
    revalidatePath("/people");
    return { error: null, eventId: event.id, addedRsvpReminder, addedGiftFor };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't add this to the calendar — please try again." }) };
  }
}

function addHours(hhmmValue: string, hours: number): string {
  const [h, m] = hhmmValue.split(":").map(Number);
  const total = Math.min(h * 60 + m + hours * 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
