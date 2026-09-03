// Module 3 (D-119, universal_intake_v2 flag): converts an APPROVED intake
// draft into a real record. This is the only place intake code writes
// outside the intake_drafts table, and it does so exclusively through
// functions already in use elsewhere in the app -- calendarEventsRepo,
// giftsRepo, peopleRepo, momentsRepo -- never a raw insert against those
// tables. "task" and "ambiguous" drafts are never auto-converted; they
// stay in the review queue for a human to act on manually (there is no
// tasks table in LifeOS at all -- see QUESTIONS.md QUEUE-008).
//
// Every write here goes through withActionLog so the trust layer's action
// log captures it (a no-op when universal_intake_v2 is off, per
// lib/trust/action-log.ts), and every write is followed by
// verifyRecordPersisted so the caller (app/api/intake/review/route.ts)
// can build a verified confirmation message instead of trusting the
// extraction's own claim.
import type { SupabaseClient } from "@supabase/supabase-js";
import { peopleRepo, listPeopleForHousehold } from "../db/repositories/people";
import { giftsRepo } from "../db/repositories/gifts";
import { calendarEventsRepo } from "../db/repositories/calendar";
import { momentsRepo } from "../db/repositories/relationship-gift-engine";
import { recipesRepo } from "../db/repositories/household";
import { usersRepo } from "../db/repositories/households";
import { intakeDraftsRepo } from "../db/repositories/intake";
import type { HouseholdRow, IntakeDraftRow, PersonRow } from "../db/database.types";
import { withActionLog } from "../trust/action-log";
import { verifyRecordPersisted, buildVerifiedConfirmationMessage } from "../trust/verified-completion";
import { isFeatureEnabled } from "../flags";
import type { ExtractedField } from "./confidence";
import { computeTripCascade, summarizeChildcareCoverage } from "./trip-cascade";

export interface ConvertContext {
  supabase: SupabaseClient;
  household: HouseholdRow;
  selfPerson: PersonRow;
  /**
   * Person the reviewer resolved this draft's "personNameMentioned" to,
   * if the record type needs one. Convert never guesses this itself --
   * fuzzy name matching against the household roster is a review-queue UI
   * concern (deferred, see next-steps item in QUESTIONS.md), not a
   * conversion concern.
   */
  resolvedPersonId?: string | null;
  /**
   * The reviewing user's own auth id -- only needed by the "flight" case
   * to look up their home address (users.home_lat/home_lng) for the trip
   * cascade's drive-time estimate. Every other case ignores this.
   */
  userId?: string | null;
}

export const NON_CONVERTIBLE_TYPES = ["task", "ambiguous"] as const;

function fieldValue(fields: Record<string, ExtractedField>, key: string): unknown {
  return fields[key]?.value ?? null;
}

function requireString(fields: Record<string, ExtractedField>, key: string): string {
  const value = fieldValue(fields, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Draft is missing required field "${key}"`);
  }
  return value;
}

export interface ConversionOutcome {
  table: string;
  recordId: string;
  confirmationMessage: string;
}

/**
 * Converts one approved draft into a real record. Throws (rather than
 * silently no-oping) when the draft's detected_record_type isn't
 * convertible or a required field/person link is missing -- the review
 * queue route is expected to surface that as a validation error to the
 * reviewer, not swallow it.
 */
export async function convertDraftToRecord(ctx: ConvertContext, draft: IntakeDraftRow): Promise<ConversionOutcome> {
  const fields = (draft.extracted_fields ?? {}) as Record<string, ExtractedField>;
  const { supabase, household, selfPerson } = ctx;

  switch (draft.detected_record_type) {
    case "calendar_event": {
      const title = requireString(fields, "eventTitle");
      const startsAtISO = requireString(fields, "eventStartsAtISO");
      const endsAtRaw = fieldValue(fields, "eventEndsAtISO");
      const allDay = fieldValue(fields, "eventAllDay") === true;
      const eventType = (fieldValue(fields, "eventType") as string | null) ?? "personal";
      const startsAt = new Date(startsAtISO);
      const endsAt = typeof endsAtRaw === "string" && endsAtRaw ? new Date(endsAtRaw) : new Date(startsAt.getTime() + 60 * 60 * 1000);

      const event = await withActionLog(supabase, {
        householdId: household.id,
        feature: "intake_convert",
        describe: (row: Awaited<ReturnType<typeof calendarEventsRepo.create>>) => `Created calendar event "${row.title}" from an intake draft`,
        tableName: "calendar_events",
        recordIdOf: (row) => row.id,
        undoable: true,
      }, () =>
        calendarEventsRepo.create(supabase, {
          household_id: household.id,
          created_by_person_id: selfPerson.id,
          title,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          all_day: allDay,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          event_type: eventType as any,
        })
      );

      const verification = await verifyRecordPersisted(supabase, calendarEventsRepo.getById, event.id, { title, all_day: allDay });
      return {
        table: "calendar_events",
        recordId: event.id,
        confirmationMessage: buildVerifiedConfirmationMessage(verification, (row) => `added "${row.title}" to the calendar`),
      };
    }

    case "gift_idea": {
      if (!ctx.resolvedPersonId) throw new Error("gift_idea draft needs a resolved person before it can be converted");
      const description = requireString(fields, "giftDescription");
      const occasionType = (fieldValue(fields, "giftOccasionType") as string | null) ?? "just_because";
      const occasionDate = (fieldValue(fields, "giftOccasionDate") as string | null) ?? new Date().toISOString().slice(0, 10);
      const costDollars = fieldValue(fields, "giftCostDollars");
      const costCents = typeof costDollars === "number" ? Math.round(costDollars * 100) : null;

      const gift = await withActionLog(supabase, {
        householdId: household.id,
        feature: "intake_convert",
        describe: (row: Awaited<ReturnType<typeof giftsRepo.create>>) => `Added gift idea "${row.description}" from an intake draft`,
        tableName: "gifts",
        recordIdOf: (row) => row.id,
        undoable: true,
      }, () =>
        giftsRepo.create(supabase, {
          person_id: ctx.resolvedPersonId as string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          occasion_type: occasionType as any,
          occasion_date: occasionDate,
          description,
          cost_cents: costCents,
          status: "idea",
        })
      );

      const verification = await verifyRecordPersisted(supabase, giftsRepo.getById, gift.id, { description });
      return {
        table: "gifts",
        recordId: gift.id,
        confirmationMessage: buildVerifiedConfirmationMessage(verification, (row) => `added the gift idea "${row.description}"`),
      };
    }

    case "person_note": {
      if (!ctx.resolvedPersonId) throw new Error("person_note draft needs a resolved person before it can be converted");
      const noteText = requireString(fields, "noteText");
      const person = await peopleRepo.getById(supabase, ctx.resolvedPersonId);
      if (!person) throw new Error("Resolved person not found");
      const nextNotes = person.notes ? `${person.notes}\n${noteText}` : noteText;

      const updated = await withActionLog(supabase, {
        householdId: household.id,
        feature: "intake_convert",
        describe: () => `Appended a note to ${person.full_name}'s profile from an intake draft`,
        tableName: "people",
        recordIdOf: (row: Awaited<ReturnType<typeof peopleRepo.update>>) => row.id,
        beforeSnapshot: { notes: person.notes },
        undoable: true,
      }, () => peopleRepo.update(supabase, ctx.resolvedPersonId as string, { notes: nextNotes }));

      const verification = await verifyRecordPersisted(supabase, peopleRepo.getById, updated.id, { notes: nextNotes });
      return {
        table: "people",
        recordId: updated.id,
        confirmationMessage: buildVerifiedConfirmationMessage(verification, (row) => `added a note to ${row.full_name}'s profile`),
      };
    }

    case "person": {
      const fullName = requireString(fields, "fullName");
      const relationshipType = (fieldValue(fields, "relationshipType") as string | null) ?? "other";
      const nickname = fieldValue(fields, "nickname");
      const birthdate = fieldValue(fields, "birthdate");

      const person = await withActionLog(supabase, {
        householdId: household.id,
        feature: "intake_convert",
        describe: (row: Awaited<ReturnType<typeof peopleRepo.create>>) => `Added ${row.full_name} as a new person from an intake draft`,
        tableName: "people",
        recordIdOf: (row) => row.id,
        undoable: true,
      }, () =>
        peopleRepo.create(supabase, {
          household_id: household.id,
          full_name: fullName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          relationship_type: relationshipType as any,
          nickname: typeof nickname === "string" ? nickname : null,
          birthdate: typeof birthdate === "string" ? birthdate : null,
        })
      );

      const verification = await verifyRecordPersisted(supabase, peopleRepo.getById, person.id, { full_name: fullName });
      return {
        table: "people",
        recordId: person.id,
        confirmationMessage: buildVerifiedConfirmationMessage(verification, (row) => `added ${row.full_name}`),
      };
    }

    case "moment": {
      const title = requireString(fields, "title");
      const occurredOn = (fieldValue(fields, "occurredOn") as string | null) ?? new Date().toISOString().slice(0, 10);
      const place = fieldValue(fields, "place");
      const notes = fieldValue(fields, "notes");

      const moment = await withActionLog(supabase, {
        householdId: household.id,
        feature: "intake_convert",
        describe: (row: Awaited<ReturnType<typeof momentsRepo.create>>) => `Logged the moment "${row.title}" from an intake draft`,
        tableName: "moments",
        recordIdOf: (row) => row.id,
        undoable: true,
      }, () =>
        momentsRepo.create(supabase, {
          household_id: household.id,
          title,
          occurred_on: occurredOn,
          place: typeof place === "string" ? place : null,
          notes: typeof notes === "string" ? notes : null,
          created_by_person_id: selfPerson.id,
        })
      );

      const verification = await verifyRecordPersisted(supabase, momentsRepo.getById, moment.id, { title });
      return {
        table: "moments",
        recordId: moment.id,
        confirmationMessage: buildVerifiedConfirmationMessage(verification, (row) => `logged the moment "${row.title}"`),
      };
    }

    case "recipe": {
      // Module 3 always offers "recipe" as a classification option (see
      // lib/intake/prompts.ts), but the destination table belongs to
      // Module 7 -- converting while household_layer is off would create
      // a household surface (a saved recipe) with the flag off, which the
      // Additive Contract forbids. Gate here, not in the prompt, so the
      // draft itself still classifies correctly and stays visible/
      // reviewable in the queue even with the flag off; only the
      // auto-convert step is blocked.
      const recipesEnabled = await isFeatureEnabled(supabase, household.id, "household_layer");
      if (!recipesEnabled) {
        throw new Error("Recipe drafts can't be converted until the household layer is enabled for this household");
      }

      const title = requireString(fields, "recipeTitle");
      const ingredients = requireString(fields, "recipeIngredients");
      const instructions = fieldValue(fields, "recipeInstructions");
      const servingsRaw = fieldValue(fields, "recipeServings");
      const sourceUrl = fieldValue(fields, "recipeSourceUrl");
      const servings = typeof servingsRaw === "number" ? Math.round(servingsRaw) : null;

      const recipe = await withActionLog(supabase, {
        householdId: household.id,
        feature: "intake_convert",
        describe: (row: Awaited<ReturnType<typeof recipesRepo.create>>) => `Saved the recipe "${row.title}" from an intake draft`,
        tableName: "recipes",
        recordIdOf: (row) => row.id,
        undoable: true,
      }, () =>
        recipesRepo.create(supabase, {
          household_id: household.id,
          created_by_person_id: selfPerson.id,
          title,
          ingredients,
          instructions: typeof instructions === "string" ? instructions : null,
          servings,
          source_url: typeof sourceUrl === "string" ? sourceUrl : null,
        })
      );

      const verification = await verifyRecordPersisted(supabase, recipesRepo.getById, recipe.id, { title });
      return {
        table: "recipes",
        recordId: recipe.id,
        confirmationMessage: buildVerifiedConfirmationMessage(verification, (row) => `saved the recipe "${row.title}"`),
      };
    }

    case "flight": {
      const departureAirport = requireString(fields, "flightDepartureAirport");
      const departureAtISO = requireString(fields, "flightDepartureAtISO");
      const departureAt = new Date(departureAtISO);
      if (Number.isNaN(departureAt.getTime())) {
        throw new Error("Flight draft has an unreadable departure time");
      }
      const airline = fieldValue(fields, "flightAirline");
      const flightNumber = fieldValue(fields, "flightNumber");
      const arrivalAirport = fieldValue(fields, "flightArrivalAirport");
      const arrivalAtRaw = fieldValue(fields, "flightArrivalAtISO");
      const arrivalAt =
        typeof arrivalAtRaw === "string" && arrivalAtRaw && !Number.isNaN(new Date(arrivalAtRaw).getTime())
          ? new Date(arrivalAtRaw)
          : null;
      // No arrival time on file (common -- boarding passes often omit it):
      // default to a 3-hour block so the flight shows as more than an
      // instant on the calendar, without pretending to know the real
      // flight duration.
      const endsAt = arrivalAt ?? new Date(departureAt.getTime() + 3 * 60 * 60 * 1000);

      const titleParts = [
        typeof airline === "string" && airline ? airline : null,
        typeof flightNumber === "string" && flightNumber ? flightNumber : null,
      ].filter(Boolean);
      const destination = typeof arrivalAirport === "string" && arrivalAirport ? arrivalAirport : null;
      const title = titleParts.length
        ? `${titleParts.join(" ")}${destination ? ` to ${destination}` : ""}`
        : `Flight${destination ? ` to ${destination}` : ` from ${departureAirport}`}`;

      const event = await withActionLog(supabase, {
        householdId: household.id,
        feature: "intake_convert",
        describe: (row: Awaited<ReturnType<typeof calendarEventsRepo.create>>) => `Created calendar event "${row.title}" from an intake draft`,
        tableName: "calendar_events",
        recordIdOf: (row) => row.id,
        undoable: true,
      }, () =>
        calendarEventsRepo.create(supabase, {
          household_id: household.id,
          created_by_person_id: selfPerson.id,
          title,
          starts_at: departureAt.toISOString(),
          ends_at: endsAt.toISOString(),
          all_day: false,
          event_type: "travel",
        })
      );

      const verification = await verifyRecordPersisted(supabase, calendarEventsRepo.getById, event.id, { title, all_day: false });
      let confirmationMessage = buildVerifiedConfirmationMessage(verification, (row) => `added "${row.title}" to the calendar`);

      // Best-effort trip cascade + childcare cross-reference -- neither
      // failing here should undo the flight event itself, which is
      // already verified and on the calendar. See lib/intake/trip-cascade.ts.
      try {
        const home = ctx.userId ? await usersRepo.getById(supabase, ctx.userId) : null;
        const cascade = await computeTripCascade(
          { departureAirport, departureAt },
          home?.home_lat != null && home?.home_lng != null ? { lat: home.home_lat, lng: home.home_lng } : null
        );

        for (const derived of cascade.events) {
          await intakeDraftsRepo.create(supabase, {
            household_id: household.id,
            created_by_person_id: selfPerson.id,
            source_type: "text",
            parser_used: "generic",
            detected_record_type: "calendar_event",
            extracted_fields: {
              eventTitle: { value: derived.title, confidence: derived.confidence },
              eventStartsAtISO: { value: derived.startsAt.toISOString(), confidence: derived.confidence },
              eventEndsAtISO: { value: derived.endsAt.toISOString(), confidence: derived.confidence },
              eventAllDay: { value: false, confidence: derived.confidence },
              eventType: { value: "travel", confidence: derived.confidence },
            },
            overall_confidence: derived.confidence,
            source_excerpt: derived.note,
            status: "needs_review",
          });
        }

        const people = await listPeopleForHousehold(supabase, household.id);
        const peopleById = new Map(people.map((p) => [p.id, p]));
        const childcare = await summarizeChildcareCoverage(
          supabase,
          household.id,
          departureAt,
          arrivalAt ?? departureAt,
          peopleById
        );

        const cascadeNote = cascade.events.length
          ? ` Added ${cascade.events.length} draft reminder${cascade.events.length === 1 ? "" : "s"} (packing, drive time, security cutoff) to the review queue.`
          : "";
        const childcareNote = childcare.hasAcceptedCoverage
          ? ` ${childcare.summaries.join(" ")}`
          : " No confirmed childcare coverage found for this trip yet.";
        confirmationMessage = `${confirmationMessage}.${cascadeNote}${childcareNote}`;
      } catch (cascadeError) {
        console.error("Trip cascade computation failed (flight event still saved):", cascadeError);
      }

      return {
        table: "calendar_events",
        recordId: event.id,
        confirmationMessage,
      };
    }

    case "task":
    case "ambiguous":
    default:
      throw new Error(`Drafts detected as "${draft.detected_record_type ?? "unknown"}" can't be auto-converted -- resolve manually in the review queue`);
  }
}
