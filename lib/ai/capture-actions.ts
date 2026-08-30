// Shared action executor for both Quick Capture (app/api/capture/route.ts,
// one action per conversational turn) and Brain Dump (app/api/brain-dump/,
// D-066, zero-or-more actions parsed from one longer transcript and
// individually reviewed/edited before being executed one at a time). Both
// features resolve freeform text into the exact same CaptureAction shape
// and need to apply it against the household's data identically, so this
// lives in one place rather than being duplicated or drifting between the
// two routes.
import { format } from "date-fns";
import type { requireHouseholdContext } from "@/lib/auth/session";
import type { CaptureAction } from "@/lib/ai/prompts/capture";
import { peopleRepo, personGiftBudgetsRepo, personInterestsRepo } from "@/lib/db/repositories/people";
import { giftsRepo } from "@/lib/db/repositories/gifts";
import { interactionsRepo, recordContactForCadence } from "@/lib/db/repositories/contact";
import { calendarEventsRepo, eventAttendeesRepo } from "@/lib/db/repositories/calendar";
import { timeOffEntriesRepo } from "@/lib/db/repositories/work-schedule";
import type { PersonRow } from "@/lib/db/database.types";

export async function executeAction(
  supabase: Awaited<ReturnType<typeof requireHouseholdContext>>["supabase"],
  household: Awaited<ReturnType<typeof requireHouseholdContext>>["household"],
  selfPerson: PersonRow,
  action: CaptureAction
): Promise<void> {
  const today = format(new Date(), "yyyy-MM-dd");

  switch (action.type) {
    case "add_interest": {
      if (!action.personId || !action.interest) throw new Error("Missing person or interest");
      await personInterestsRepo.upsert(
        supabase,
        {
          person_id: action.personId,
          interest: action.interest,
          strength: action.interestStrength ?? "casual",
          source: "inferred_from_conversation",
        },
        "person_id,interest"
      );
      return;
    }
    case "log_interaction": {
      if (!action.personId) throw new Error("Missing person");
      const interactionType = action.interactionType ?? "other";
      await interactionsRepo.create(supabase, {
        person_id: action.personId,
        interaction_type: interactionType,
        occurred_on: today,
        notes: action.interactionNotes ?? null,
      });
      await recordContactForCadence(supabase, action.personId, today, interactionType);
      return;
    }
    case "record_gift": {
      if (!action.personId || !action.giftDescription) throw new Error("Missing person or gift description");
      await giftsRepo.create(supabase, {
        person_id: action.personId,
        occasion_type: action.giftOccasionType ?? "just_because",
        occasion_date: action.giftOccasionDate ?? today,
        description: action.giftDescription,
        cost_cents: action.giftCostDollars != null ? Math.round(action.giftCostDollars * 100) : null,
        status: "idea",
      });
      return;
    }
    case "add_gift_budget": {
      if (!action.personId) throw new Error("Missing person");
      // D-080 (P2-6): a capture that only states one side of the range
      // ("Cal's gift budget is up to $150") used to zero-fill the other
      // side, silently writing a $0 floor as a permanent person-specific
      // override -- resolveGiftBudget() (lib/gifts/budget.ts) then always
      // prefers that broken row over the household's real default, both
      // for display on the person page and for actual gift-suggestion
      // generation. Falling back to the household default for whichever
      // side wasn't stated keeps the person's stored default in sync with
      // the household default instead of introducing a competing number.
      const minCents =
        action.budgetMinDollars != null
          ? Math.round(action.budgetMinDollars * 100)
          : household.default_gift_budget_min_cents ?? 0;
      const maxCents =
        action.budgetMaxDollars != null
          ? Math.round(action.budgetMaxDollars * 100)
          : household.default_gift_budget_max_cents ?? 0;
      await personGiftBudgetsRepo.create(supabase, {
        person_id: action.personId,
        occasion_type: action.budgetOccasionType ?? "default",
        min_cents: minCents,
        max_cents: maxCents,
      });
      return;
    }
    case "append_person_note": {
      if (!action.personId || !action.noteText) throw new Error("Missing person or note text");
      const person = await peopleRepo.getById(supabase, action.personId);
      if (!person) throw new Error("Person not found");
      const nextNotes = person.notes ? `${person.notes}\n${action.noteText}` : action.noteText;
      await peopleRepo.update(supabase, action.personId, { notes: nextNotes });
      return;
    }
    case "create_calendar_event": {
      if (!action.eventTitle || !action.eventStartsAtISO) throw new Error("Missing event title or start time");
      // P0-4: when no time of day was ever stated, the model/review-UI sets
      // eventAllDay rather than us inventing a clock time. All-day events
      // span midnight-to-midnight of the given date, matching the manual
      // Add Event form's own all-day convention (app/api/calendar/events).
      const allDay = action.eventAllDay ?? false;
      const startsAt = new Date(action.eventStartsAtISO);
      let startsAtISO: string;
      let endsAtISO: string;
      if (allDay) {
        const datePart = format(startsAt, "yyyy-MM-dd");
        startsAtISO = new Date(`${datePart}T00:00:00`).toISOString();
        endsAtISO = new Date(`${datePart}T23:59:59`).toISOString();
      } else {
        const endsAt = action.eventEndsAtISO ? new Date(action.eventEndsAtISO) : new Date(startsAt.getTime() + 60 * 60 * 1000);
        startsAtISO = startsAt.toISOString();
        endsAtISO = endsAt.toISOString();
      }
      const event = await calendarEventsRepo.create(supabase, {
        household_id: household.id,
        created_by_person_id: selfPerson.id,
        title: action.eventTitle,
        starts_at: startsAtISO,
        ends_at: endsAtISO,
        all_day: allDay,
        event_type: action.eventType ?? "personal",
      });
      if (action.personId) {
        await eventAttendeesRepo.create(supabase, {
          calendar_event_id: event.id,
          person_id: action.personId,
        });
      }
      return;
    }
    case "add_time_off": {
      if (!action.timeOffStartDate) throw new Error("Missing time off start date");
      // Rule 7 in CAPTURE_SYSTEM_PROMPT / BRAIN_DUMP_SYSTEM_PROMPT: an
      // unnamed person defaults to the household's "self" person for this
      // action type specifically — the one deliberate exception to "never
      // guess which person" elsewhere in this switch. selfPerson is
      // already resolved by requireHouseholdContext(), same
      // client-trusted value used above for create_calendar_event's
      // created_by_person_id.
      const personId = action.personId ?? selfPerson.id;
      const startDate = action.timeOffStartDate;
      const endDate = action.timeOffEndDate ?? startDate;
      if (endDate < startDate) throw new Error("Time off end date is before the start date");
      await timeOffEntriesRepo.create(supabase, {
        person_id: personId,
        start_date: startDate,
        end_date: endDate,
        reason: action.timeOffReason ?? "",
        source: "quick_capture",
      });
      return;
    }
  }
}

/** Defense in depth beyond RLS, shared by both routes: the model only ever
 * saw this household's people, but never trust an LLM-produced id against
 * a foreign-key write without checking it against what was actually handed
 * to it. */
export function isKnownPersonId(people: PersonRow[], personId: string | null): boolean {
  if (!personId) return true;
  return people.some((p) => p.id === personId);
}
