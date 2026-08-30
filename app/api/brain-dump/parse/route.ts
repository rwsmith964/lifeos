// Brain-dump parse endpoint (D-066). Takes one long freeform transcript
// (voice-dictated or typed) and asks the AI to split it into zero or more
// candidate actions, returned for the client to show in an approve/edit
// review list — nothing is written to the database here. See
// app/api/brain-dump/execute/route.ts for the second step that actually
// applies an approved (possibly user-edited) item, and
// lib/ai/prompts/brain-dump.ts for the schema/prompt this shares with
// Quick Capture's CaptureAction shape.
import { NextResponse } from "next/server";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { AiBudgetExceededError, AiUnavailableError, callAi, isAiConfigured } from "@/lib/ai/client";
import { buildChildTokenMap } from "@/lib/ai/context";
import { parseAiJson } from "@/lib/ai/parse-json";
import { buildBrainDumpUserPrompt, brainDumpResponseSchema, BRAIN_DUMP_SYSTEM_PROMPT } from "@/lib/ai/prompts/brain-dump";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";

interface BrainDumpParseRequestBody {
  transcript: string;
}

export async function POST(request: Request) {
  const { supabase, household } = await requireHouseholdContext();

  if (!isAiConfigured()) {
    return NextResponse.json({
      status: "unavailable",
      message: "Brain dump is temporarily unavailable. Try again in a few minutes.",
    });
  }

  let body: BrainDumpParseRequestBody;
  try {
    body = (await request.json()) as BrainDumpParseRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const transcript = body.transcript?.trim();
  if (!transcript) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
  }

  const people = await listPeopleForHousehold(supabase, household.id);
  const tokenMap = buildChildTokenMap(people);
  // labelFor already prefers nickname over full_name for non-children and
  // returns the CHILD_N token for children (P0-2) -- no per-call-site
  // fallback needed here anymore.
  const dumpPeople = people.map((p) => ({
    id: p.id,
    label: tokenMap.labelFor(p),
    relationshipType: p.relationship_type,
  }));

  // Rewrite any child's nickname/full name/first name mentioned in the raw
  // transcript to their CHILD_N token BEFORE building the prompt, so "Cal's
  // shoe size is 10" becomes "CHILD_1's shoe size is 10" -- matching the
  // token-only roster line above and letting the model actually resolve
  // personId instead of silently leaving it null (P0-2). Text fields in the
  // AI's response are restored back to real names below via
  // tokenMap.restoreRealNames, same as before.
  const redactedTranscript = tokenMap.redactMentions(transcript);
  const userPrompt = buildBrainDumpUserPrompt(format(new Date(), "EEEE, MMMM d, yyyy"), dumpPeople, redactedTranscript);

  let aiResult;
  try {
    aiResult = await callAi(supabase, {
      householdId: household.id,
      feature: "brain_dump",
      systemPrompt: BRAIN_DUMP_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 4096,
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      console.error("Brain dump unavailable:", error.message);
      return NextResponse.json({ status: "unavailable", message: "Brain dump is temporarily unavailable. Try again in a few minutes." });
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

  // Defense in depth beyond RLS, same as Quick Capture: drop (rather than
  // fail the whole batch for) any item whose personId doesn't match a
  // person we actually handed the model — the review UI will just show
  // that item with no person preselected instead.
  const knownIds = new Set(people.map((p) => p.id));
  const items = validated.data.items.map((item) => {
    const restore = (text: string | null) => (text ? tokenMap.restoreRealNames(text) : text);
    return {
      ...item,
      personId: item.personId && knownIds.has(item.personId) ? item.personId : null,
      summary: tokenMap.restoreRealNames(item.summary),
      interactionNotes: restore(item.interactionNotes),
      giftDescription: restore(item.giftDescription),
      eventTitle: restore(item.eventTitle),
      noteText: restore(item.noteText),
      timeOffReason: restore(item.timeOffReason),
    };
  });

  return NextResponse.json({
    status: "ready",
    items,
    people: dumpPeople.map((p) => ({ id: p.id, label: tokenMap.restoreRealNames(p.label), relationshipType: p.relationshipType })),
  });
}
