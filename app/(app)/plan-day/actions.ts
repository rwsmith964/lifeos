"use server";

// Confirming a planned day: creates one calendar event per stop (at the right
// place, with the kids and whoever's house it is attached) and, optionally, a
// drive block before each. Nothing is written until this runs.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo, eventAttendeesRepo } from "@/lib/db/repositories/calendar";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { friendlyMutationError } from "@/lib/db/errors";
import { floatingIso } from "@/lib/custody/materialize";

export interface PlanDayActionResult {
  error: string | null;
  created?: number;
}

const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);

const planSchema = z.object({
  stops: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        personId: z.string().uuid().nullable(),
        address: z.string().max(300).nullable(),
        lat: z.number().min(-90).max(90).nullable(),
        lng: z.number().min(-180).max(180).nullable(),
        driveMinutes: z.number().int().min(0).max(600),
        departLocal: local,
        arriveLocal: local,
        leaveLocal: local,
        notes: z.string().max(500).nullable(),
      })
    )
    .min(1)
    .max(10),
  childPersonIds: z.array(z.string().uuid()).max(12),
  includeDriveBlocks: z.boolean(),
});
export type DayPlanInput = z.infer<typeof planSchema>;

export async function createDayPlanAction(raw: DayPlanInput): Promise<PlanDayActionResult> {
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return { error: "That plan looks out of date — ask me to plan it again." };
  const input = parsed.data;
  if (input.stops.some((s) => new Date(floatingIso(s.leaveLocal)) <= new Date(floatingIso(s.arriveLocal)))) {
    return { error: "A stop ends before it starts — ask me to plan it again." };
  }

  const { supabase, household, selfPerson } = await requireHouseholdContext();
  try {
    const people = await listPeopleForHousehold(supabase, household.id);
    const known = new Set(people.map((p) => p.id));
    const childIds = input.childPersonIds.filter((id) => known.has(id));
    let created = 0;

    for (const stop of input.stops) {
      const hostId = stop.personId && known.has(stop.personId) ? stop.personId : null;

      if (input.includeDriveBlocks && stop.driveMinutes >= 5) {
        await calendarEventsRepo.create(supabase, {
          household_id: household.id,
          created_by_person_id: selfPerson.id,
          title: `Drive to ${stop.name}`,
          description: `About ${stop.driveMinutes} min drive.`,
          starts_at: floatingIso(stop.departLocal),
          ends_at: floatingIso(stop.arriveLocal),
          all_day: false,
          location_lat: stop.lat,
          location_lng: stop.lng,
          event_type: "travel",
        });
        created += 1;
      }

      const event = await calendarEventsRepo.create(supabase, {
        household_id: household.id,
        created_by_person_id: selfPerson.id,
        title: stop.name,
        description: stop.notes,
        starts_at: floatingIso(stop.arriveLocal),
        ends_at: floatingIso(stop.leaveLocal),
        all_day: false,
        location: stop.address,
        location_lat: stop.lat,
        location_lng: stop.lng,
        host_person_id: hostId,
        event_type: childIds.length > 0 ? "family" : "personal",
      });
      created += 1;

      const attendeeIds = [...new Set([...childIds, ...(hostId ? [hostId] : [])])];
      if (attendeeIds.length > 0) {
        await eventAttendeesRepo.createMany(
          supabase,
          attendeeIds.map((personId) => ({ calendar_event_id: event.id, person_id: personId }))
        );
      }
    }

    revalidatePath("/calendar");
    return { error: null, created };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't add those to the calendar — please try again." }) };
  }
}
