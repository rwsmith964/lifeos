// Brain-dump parse endpoint (D-066, extended P3-7). Takes one long freeform
// transcript (voice-dictated or typed) and asks the AI to split it into
// zero or more candidate actions, returned for the client to show in an
// approve/edit review list. See app/api/brain-dump/execute/route.ts for
// the second step that actually applies an approved (possibly
// user-edited) item, and lib/ai/prompts/brain-dump.ts for the
// schema/prompt this shares with Quick Capture's CaptureAction shape.
//
// P3-7: every call now persists a brain_dump_batches row so the original
// transcript survives even if the AI call fails or the user navigates
// away, and can be re-run later without retyping. A fresh transcript
// (no batchId) creates a new batch *before* the AI call so the text is
// saved even on failure; a batchId re-runs that batch's already-stored
// transcript — the stored transcript is the single source of truth, so
// re-running never accepts a different transcript string from the
// client.
import { NextResponse } from "next/server";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { AiBudgetExceededError, AiUnavailableError, callAi, isAiConfigured } from "@/lib/ai/client";
import { buildChildTokenMap } from "@/lib/ai/context";
import { parseAiJson } from "@/lib/ai/parse-json";
import { buildBrainDumpUserPrompt, brainDumpResponseSchema, BRAIN_DUMP_SYSTEM_PROMPT } from "@/lib/ai/prompts/brain-dump";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { brainDumpBatchesRepo } from "@/lib/db/repositories/brain-dump";
import type { BrainDumpBatchRow, BrainDumpParseStatus } from "@/lib/db/database.types";

interface BrainDumpParseRequestBody {
  transcript?: string;
  batchId?: string;
}

export async function POST(request: Request) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();

  let body: BrainDumpParseRequestBody;
  try {
    body = (await request.json()) as BrainDumpParseRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Re-running an existing batch: the stored transcript is authoritative
  // (never trust a client-supplied transcript string for a batchId that
  // already exists — see file header). A fresh dump has no batchId yet,
  // so it's created below from body.transcript instead.
  let batch: BrainDumpBatchRow;
  if (body.batchId) {
    const existing = await brainDumpBatchesRepo.getById(supabase, body.batchId);
    if (!existing || existing.household_id !== household.id) {
      return NextResponse.json({ error: "That brain dump wasn't found." }, { status: 404 });
    }
    batch = existing;
  } else {
    const transcript = body.transcript?.trim();
    if (!transcript) {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }
    batch = await brainDumpBatchesRepo.create(supabase, {
      household_id: household.id,
      created_by_person_id: selfPerson.id,
      transcript,
    });
  }
  const transcript = batch.transcript;

  // Helper so every early-return path below still records the outcome on
  // the batch row instead of only the happy path — a re-run that hits
  // "unavailable" should show that status in history, not silently leave
  // the batch looking untouched.
  async function finish(status: BrainDumpParseStatus, message: string | null, items: unknown[] = []) {
    await brainDumpBatchesRepo.update(supabase, batch.id, {
      parse_status: status,
      parse_message: message,
      items: items as never,
    });
    return NextResponse.json({ batchId: batch.id, status, message, items });
  }

  if (!isAiConfigured()) {
    return finish("unavailable", "Brain dump is temporarily unavailable. Try again in a few minutes.");
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
      return finish("unavailable", "Brain dump is temporarily unavailable. Try again in a few minutes.");
    }
    if (error instanceof AiBudgetExceededError) {
      return finish("unavailable", "Today's AI budget for this household has been reached — try again tomorrow.");
    }
    throw error;
  }

  const parsed = parseAiJson(aiResult.text);
  if (!parsed.success) {
    return finish("error", "Couldn't understand that — try rephrasing.");
  }
  const validated = brainDumpResponseSchema.safeParse(parsed.data);
  if (!validated.success) {
    return finish("error", "Couldn't understand that — try rephrasing.");
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
      timeOffDestination: restore(item.timeOffDestination),
    };
  });

  await brainDumpBatchesRepo.update(supabase, batch.id, {
    parse_status: "ready",
    parse_message: null,
    items: items as never,
  });

  return NextResponse.json({
    batchId: batch.id,
    status: "ready",
    items,
    people: dumpPeople.map((p) => ({ id: p.id, label: tokenMap.restoreRealNames(p.label), relationshipType: p.relationshipType })),
  });
}
