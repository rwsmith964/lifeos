// Quick-capture endpoint backing the floating capture button (every page,
// see components/capture/capture-button.tsx). Takes the running
// user/assistant transcript, asks the AI to resolve it into a specific
// write against the user's own data (or a clarifying question), executes
// that write through the normal RLS-bound client, and returns the AI's
// reply for the panel to render. See DECISIONS.md D-030.
//
// P1-14/D-078: this used to call its own separate CAPTURE_SYSTEM_PROMPT +
// captureActionSchema (lib/ai/prompts/capture.ts) instead of Brain Dump's
// parser, and the two prompts drifted — "Cal's shoe size is 10" (a plain
// person note) resolved fine through Brain Dump but fell through Quick
// Capture's own prompt to a generic "Couldn't understand that — try
// rephrasing." with no way to tell what was actually unclear. Per the
// "make one the single source of truth" ground rule, Quick Capture now
// calls the exact same BRAIN_DUMP_SYSTEM_PROMPT / brainDumpResponseSchema
// / buildBrainDumpUserPrompt Brain Dump uses, and adapts the resulting
// item list back into this endpoint's single-action-per-turn,
// ask-one-specific-question conversational shape.
import { NextResponse } from "next/server";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { AiBudgetExceededError, AiUnavailableError, callAi, isAiConfigured } from "@/lib/ai/client";
import { buildChildTokenMap } from "@/lib/ai/context";
import { parseAiJson } from "@/lib/ai/parse-json";
import {
  buildBrainDumpUserPrompt,
  brainDumpResponseSchema,
  BRAIN_DUMP_SYSTEM_PROMPT,
  type BrainDumpItem,
} from "@/lib/ai/prompts/brain-dump";
import type { CaptureTurn } from "@/lib/ai/prompts/capture";
import { executeAction, isKnownPersonId, verifyExecuted } from "@/lib/ai/capture-actions";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { friendlyMutationError } from "@/lib/db/errors";
import { isFeatureEnabled } from "@/lib/flags";

interface CaptureRequestBody {
  turns: CaptureTurn[];
}

// Mirrors the "personId is required for every action type except
// create_calendar_event ... and add_time_off" rule both prompts already
// state — the action types below need a resolved person before they're
// safe to execute (executeAction throws "Missing person" for all of
// these otherwise). create_calendar_event and add_time_off deliberately
// tolerate a null personId (an event with no specific attendee; time off
// defaults to the device's own user), so they're intentionally excluded.
const PERSON_REQUIRED_TYPES = new Set<BrainDumpItem["type"]>([
  "add_interest",
  "log_interaction",
  "record_gift",
  "append_person_note",
  "add_gift_budget",
]);

function clarifyingQuestionFor(type: BrainDumpItem["type"]): string {
  switch (type) {
    case "add_interest":
      return "I got that as something to add to their interests, but not who — who is this for?";
    case "log_interaction":
      return "I got that as a call or visit to log, but not with whom — who was this with?";
    case "record_gift":
      return "I got that as a gift idea, but not who it's for — who is this for?";
    case "add_gift_budget":
      return "I got that as a gift budget, but not whose — who is this for?";
    case "append_person_note":
    default:
      // The exact example from the bug report: a plain person note like
      // "Cal's shoe size is 10" whose subject couldn't be resolved.
      return "I got the note but not who it's about — who is this for?";
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
  // labelFor already prefers nickname over full_name for non-children and
  // returns the CHILD_N token for children (P0-2), matching Brain Dump so
  // the same input resolves the same way in both features.
  const capturePeople = people.map((p) => ({
    id: p.id,
    label: tokenMap.labelFor(p),
    relationshipType: p.relationship_type,
  }));

  // Same fix as Brain Dump (P0-2): rewrite child nickname/full name/first
  // name mentions in every turn's raw text to the matching CHILD_N token
  // before building the prompt, so "Cal's shoe size is 10" resolves
  // against the token-only roster line above instead of the model failing
  // to match a redacted child at all.
  const redactedTurns = body.turns.map((turn) => ({ ...turn, text: tokenMap.redactMentions(turn.text) }));

  // Brain Dump's prompt takes one flat transcript, not a labeled dialogue.
  // Quick Capture's own turns already carry the full back-and-forth (the
  // clarifying question we asked, and the user's answer) — joining just
  // the user's own turns reconstructs the same information Brain Dump
  // would see if the user had just said it all in one breath, e.g.
  // "log a call today" + a follow-up answer "Mom" becomes
  // "log a call today. Mom." for the model to resolve as one item.
  const combinedTranscript = redactedTurns
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join(". ");

  const userPrompt = buildBrainDumpUserPrompt(format(new Date(), "EEEE, MMMM d, yyyy"), capturePeople, combinedTranscript);

  let aiResult;
  try {
    aiResult = await callAi(supabase, {
      householdId: household.id,
      feature: "quick_capture",
      systemPrompt: BRAIN_DUMP_SYSTEM_PROMPT,
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
  const validated = brainDumpResponseSchema.safeParse(parsed.data);
  if (!validated.success) {
    return NextResponse.json({ status: "error", message: "Couldn't understand that — try rephrasing." });
  }

  const items = validated.data.items;

  if (items.length === 0) {
    return NextResponse.json({
      status: "unrecognized",
      confirmationMessage: "I don't see anything to save there — try mentioning a person, event, or gift.",
    });
  }

  if (items.length > 1) {
    // Quick Capture executes one action per turn (unlike Brain Dump's
    // multi-item review list) — say specifically why this didn't go
    // through instead of a flat rejection, per the bug report.
    return NextResponse.json({
      status: "error",
      message: "That sounds like more than one thing — try sending them one at a time.",
    });
  }

  const item = items[0];
  const restore = (text: string | null) => (text ? tokenMap.restoreRealNames(text) : text);

  // Defense in depth beyond RLS: the model only ever saw this household's
  // people, but never trust an LLM-produced id against a foreign-key write
  // without checking it against what we actually handed it.
  const personId = item.personId && isKnownPersonId(people, item.personId) ? item.personId : null;

  if (PERSON_REQUIRED_TYPES.has(item.type) && !personId) {
    return NextResponse.json({
      status: "needs_clarification",
      question: clarifyingQuestionFor(item.type),
    });
  }

  const action = { ...item, personId };

  let executeResult;
  try {
    executeResult = await executeAction(supabase, household, selfPerson, action);
  } catch (error) {
    return NextResponse.json({
      status: "error",
      message: friendlyMutationError(error, { fallback: "Couldn't save that — please try again." }),
    });
  }

  // item.summary is phrased as an instruction ("Add 'fly fishing' to
  // Dave's interests") for Brain Dump's review list; reused here as a
  // plain-language confirmation of what was just saved.
  //
  // Module 3 (D-119, universal_intake_v2 flag) trust layer: this used to
  // assert "Saved" purely from item.summary, the AI's own pre-write claim,
  // never re-checked against what actually landed in the database — the
  // exact "assistant asserts completion on its own say-so" failure mode
  // the brief calls out. Flag OFF keeps the prior byte-identical
  // statement; flag ON adds one real state check against the row
  // executeAction just wrote before making the same claim.
  const intakeTrustEnabled = await isFeatureEnabled(supabase, household.id, "universal_intake_v2");
  const savedMessage = `Saved — ${restore(item.summary) ?? "done"}.`;
  if (!intakeTrustEnabled) {
    return NextResponse.json({ status: "ready", confirmationMessage: savedMessage });
  }
  const verified = await verifyExecuted(supabase, executeResult);
  const confirmationMessage = verified ? savedMessage : "That may not have saved correctly — please check and try again.";
  return NextResponse.json({ status: "ready", confirmationMessage });
}
