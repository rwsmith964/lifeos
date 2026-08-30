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
import { buildCaptureUserPrompt, captureActionSchema, CAPTURE_SYSTEM_PROMPT, type CaptureTurn } from "@/lib/ai/prompts/capture";
import { executeAction, isKnownPersonId } from "@/lib/ai/capture-actions";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { friendlyMutationError } from "@/lib/db/errors";

interface CaptureRequestBody {
  turns: CaptureTurn[];
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

  const userPrompt = buildCaptureUserPrompt(format(new Date(), "EEEE, MMMM d, yyyy"), capturePeople, redactedTurns);

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
  if (!isKnownPersonId(people, response.action.personId)) {
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
