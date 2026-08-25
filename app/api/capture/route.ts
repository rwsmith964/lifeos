// Quick-capture endpoint backing the floating capture button (every page,
// see components/capture/capture-button.tsx). Takes the running
// user/assistant transcript, asks the AI to resolve it into a specific
// write against the user's own data (or a clarifying question), executes
// that write through the normal RLS-bound client, and returns the AI's
// reply for the panel to render. See DECISIONS.md D-030.
import { NextResponse } from "next/server";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { AiBudgetExceededError, AiUnavailableError, callAi, isAiConfigured } from "@/lib/ai/client";
import { buildChildTokenMap } from "@/lib/ai/context";
import { parseAiJson } from "@/lib/ai/parse-json";
import {
  buildCaptureUserPrompt,
  captureActionSchema,
  CAPTURE_SYSTEM_PROMPT,
  type CaptureAction,
  type CaptureTurn,
} from "@/lib/ai/prompts/capture";
import { listPeopleForHousehold, peopleRepo, personGiftBudgetsRepo, personInterestsRepo } from "@/lib/db/repositories/people";
import { giftsRepo } from "@/lib/db/repositories/gifts";
import { interactionsRepo, recordContactForCadence } from "@/lib/db/repositories/contact";
import { calendarEventsRepo, eventAttendeesRepo } from "@/lib/db/repositories/calendar";
import { friendlyMutationError } from "@/lib/db/errors";
import type { PersonRow } from "@/lib/db/database.types";

interface CaptureRequestBody {
  turns: CaptureTurn[];
}

async function executeAction(
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
      await personGiftBudgetsRepo.create(supabase, {
        person_id: action.personId,
        occasion_type: action.budgetOccasionType ?? "default",
        min_cents: Math.round((action.budgetMinDollars ?? 0) * 100),
        max_cents: Math.round((action.budgetMaxDollars ?? 0) * 100),
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
      const startsAt = new Date(action.eventStartsAtISO);
      const endsAt = action.eventEndsAtISO ? new Date(action.eventEndsAtISO) : new Date(startsAt.getTime() + 60 * 60 * 1000);
      const event = await calendarEventsRepo.create(supabase, {
        household_id: household.id,
        created_by_person_id: selfPerson.id,
        title: action.eventTitle,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
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
  }
}

export async function POST(request: Request) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();

  if (!isAiConfigured()) {
    return NextResponse.json({
      status: "unavailable",
      message: "Quick Capture is temporarily unavailable. Try again in a few minutes.",
    });
  }

  let body: CaptureRequestBody;
  try {
    body = (await request.json()) as CaptureRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!Array.isArray(body.turns) || body.turns.length === 0) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  const people = await listPeopleForHousehold(supabase, household.id);
  const tokenMap = buildChildTokenMap(people);
  const capturePeople = people.map((p) => ({
    id: p.id,
    label: p.relationship_type === "child" ? tokenMap.labelFor(p) : p.nickname || p.full_name,
    relationshipType: p.relationship_type,
  }));

  const userPrompt = buildCaptureUserPrompt(format(new Date(), "EEEE, MMMM d, yyyy"), capturePeople, body.turns);

  let aiResult;
  try {
    aiResult = await callAi(supabase, {
      householdId: household.id,
      feature: "quick_capture",
      systemPrompt: CAPTURE_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1024,
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      console.error("Quick Capture unavailable:", error.message);
      return NextResponse.json({ status: "unavailable", message: "Quick Capture is temporarily unavailable. Try again in a few minutes." });
    }
    if (error instanceof AiBudgetExceededError) {
      return NextResponse.json({
        status: "unavailable",
        message: "Today's AI budget for this household has been reached — try again tomorrow.",
      });
    }
    throw error;
  }

  const parsed = parseAiJson(aiResult.text);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Couldn't understand that — try rephrasing." });
  }
  const validated = captureActionSchema.safeParse(parsed.data);
  if (!validated.success) {
    return NextResponse.json({ status: "error", message: "Couldn't understand that — try rephrasing." });
  }

  const response = validated.data;
  const question = response.question ? tokenMap.restoreRealNames(response.question) : null;
  const confirmationMessage = response.confirmationMessage
    ? tokenMap.restoreRealNames(response.confirmationMessage)
    : null;

  if (response.status !== "ready" || !response.action) {
    return NextResponse.json({ status: response.status, question, confirmationMessage });
  }

  // Defense in depth beyond RLS: the model only ever saw this household's
  // people, but never trust an LLM-produced id against a foreign-key write
  // without checking it against what we actually handed it.
  if (response.action.personId && !people.some((p) => p.id === response.action!.personId)) {
    return NextResponse.json({
      status: "error",
      message: "Something went wrong resolving who that's about — try naming them again.",
    });
  }

  try {
    await executeAction(supabase, household, selfPerson, response.action);
  } catch (error) {
    return NextResponse.json({
      status: "error",
      message: friendlyMutationError(error, { fallback: "Couldn't save that — please try again." }),
    });
  }

  return NextResponse.json({ status: "ready", confirmationMessage });
}
