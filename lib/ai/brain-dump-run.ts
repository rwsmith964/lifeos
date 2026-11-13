// Shared "ask the AI to split a note into items" step used by both Brain Dump
// and Quick Capture, so they can't drift apart (see the header of
// lib/ai/prompts/capture.ts). The model's JSON is read forgivingly: a long,
// busy note (a weekend of drop-offs, say) produces many items, and one
// missing empty field or one unexpected label used to throw the whole batch
// away with "Couldn't understand that". Now each item is read on its own,
// unreadable ones are skipped, and an unreadable reply is retried once.
import type { SupabaseClient } from "@supabase/supabase-js";
import { callAi } from "./client";
import { BRAIN_DUMP_SYSTEM_PROMPT, brainDumpItemSchema, type BrainDumpItem } from "./prompts/brain-dump";

// Every item field that the model may leave out; a missing one means "null".
const NULL_DEFAULTS: Omit<BrainDumpItem, "type" | "summary"> = {
  personId: null,
  personName: null,
  personRelationshipTypeGuess: null,
  personNotes: null,
  activityType: null,
  activityNotes: null,
  interest: null,
  interestStrength: null,
  interactionType: null,
  interactionNotes: null,
  giftDescription: null,
  giftOccasionType: null,
  giftOccasionDate: null,
  giftCostDollars: null,
  eventTitle: null,
  eventStartsAtISO: null,
  eventEndsAtISO: null,
  eventAllDay: null,
  eventDateApproximate: null,
  eventType: null,
  noteText: null,
  budgetOccasionType: null,
  budgetMinDollars: null,
  budgetMaxDollars: null,
  timeOffStartDate: null,
  timeOffEndDate: null,
  timeOffReason: null,
  timeOffDestination: null,
  workStartTime: null,
  workEndTime: null,
  workDays: null,
};

const OPTIONAL_ENUM_FIELDS = [
  "personRelationshipTypeGuess",
  "interestStrength",
  "interactionType",
  "giftOccasionType",
  "budgetOccasionType",
  "eventType",
] as const;

export type BrainDumpReadResult =
  | { ok: true; items: BrainDumpItem[]; skipped: number }
  | { ok: false; reason: string };

/** Pulls the JSON object out of a reply that may carry fences or a sentence of prose around it. */
function extractJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON object in reply");
    return JSON.parse(stripped.slice(start, end + 1));
  }
}

export function readBrainDumpReply(text: string): BrainDumpReadResult {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (error) {
    return { ok: false, reason: `not JSON (${error instanceof Error ? error.message : "parse error"})` };
  }
  const rawItems = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(rawItems)) return { ok: false, reason: "reply had no items list" };

  const items: BrainDumpItem[] = [];
  let skipped = 0;
  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") {
      skipped++;
      continue;
    }
    const candidate: Record<string, unknown> = { ...NULL_DEFAULTS, ...(entry as Record<string, unknown>) };
    // Missing fields are null; a label we don't recognise becomes null rather than sinking the item.
    for (const key of Object.keys(NULL_DEFAULTS)) if (candidate[key] === undefined) candidate[key] = null;
    const parsed = brainDumpItemSchema.safeParse(candidate);
    if (parsed.success) {
      items.push(parsed.data);
      continue;
    }
    const lenient = { ...candidate };
    for (const field of OPTIONAL_ENUM_FIELDS) {
      if (parsed.error.issues.some((issue) => issue.path[0] === field)) lenient[field] = null;
    }
    const retried = brainDumpItemSchema.safeParse(lenient);
    if (retried.success) items.push(retried.data);
    else skipped++;
  }
  if (rawItems.length > 0 && items.length === 0) return { ok: false, reason: `all ${rawItems.length} items failed validation` };
  return { ok: true, items, skipped };
}

const RETRY_NOTE =
  "\n\nYour previous reply could not be read. Reply again with ONLY the JSON object described above: no prose, no markdown, every item complete.";

export interface RunBrainDumpParams {
  householdId: string;
  timezone: string;
  feature: string;
  userPrompt: string;
}

/**
 * Throws AiUnavailableError / AiBudgetExceededError like callAi; the caller
 * handles those. Returns ok:false only when two attempts both came back unreadable.
 */
export async function runBrainDumpAi(
  supabase: SupabaseClient,
  params: RunBrainDumpParams
): Promise<BrainDumpReadResult> {
  let lastReason = "unknown";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callAi(supabase, {
      householdId: params.householdId,
      timezone: params.timezone,
      feature: params.feature,
      systemPrompt: BRAIN_DUMP_SYSTEM_PROMPT,
      userPrompt: attempt === 0 ? params.userPrompt : params.userPrompt + RETRY_NOTE,
      maxTokens: 8192, // a big dump can yield dozens of items; 4096 truncated the JSON
    });
    const read = readBrainDumpReply(result.text);
    if (read.ok) {
      if (read.skipped > 0) console.warn(`${params.feature}: skipped ${read.skipped} unreadable item(s)`);
      return read;
    }
    lastReason = read.reason;
    console.error(`${params.feature}: unreadable AI reply on attempt ${attempt + 1}: ${read.reason} (${result.text.length} chars, ${result.outputTokens} tokens)`);
  }
  return { ok: false, reason: lastReason };
}
