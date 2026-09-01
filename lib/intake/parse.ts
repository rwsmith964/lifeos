// Module 3 (D-119, universal_intake_v2 flag): turns one intake submission
// (text/voice/email/image/screenshot/pdf/ics) into one or more structured
// extraction results. Nothing in this file writes to the database -- see
// app/api/intake/route.ts for where a parse result becomes an
// intake_drafts row, and lib/intake/convert.ts for where an approved
// draft becomes a real record.
import type { SupabaseClient } from "@supabase/supabase-js";
import { callAi, type AiCallResult } from "../ai/client";
import { parseAiJson } from "../ai/parse-json";
import { parseIcsFeed } from "../calendar/ics-import";
import type { HouseholdRow, IntakeDraftRow } from "../db/database.types";
import {
  ACTIVITY_SCHEDULE_SYSTEM_PROMPT,
  GENERIC_INTAKE_SYSTEM_PROMPT,
  SCHOOL_FLYER_SYSTEM_PROMPT,
  intakeExtractionSchema,
  type IntakeExtraction,
} from "./prompts";
import { computeOverallConfidence, type ExtractedField } from "./confidence";

export type IntakeParserKey = IntakeDraftRow["parser_used"];

export interface IntakeParseResult {
  parserUsed: IntakeParserKey;
  detectedRecordType: IntakeDraftRow["detected_record_type"];
  extractedFields: Record<string, ExtractedField>;
  overallConfidence: number;
  sourceExcerpt: string;
  /** Raw name mentioned in the source, if any -- resolved against the
   * household roster by the caller (app/api/intake/route.ts), never here. */
  personNameMentioned: string | null;
  aiCallResult: AiCallResult | null;
}

const ACTIVITY_SCHEDULE_HINTS = [
  "practice",
  "roster",
  "season schedule",
  "game schedule",
  "tournament",
  "scrimmage",
  "league",
  "vs.",
  "vs ",
];
const SCHOOL_FLYER_HINTS = [
  "permission slip",
  "field trip",
  "pta",
  "classroom",
  "school newsletter",
  "principal",
  "sign and return",
  "please return",
];

/** Picks a named parser from the raw text when no explicit hint was given
 * -- a simple keyword heuristic, not an AI call (keeping detection free
 * and instant; the chosen prompt itself does the real extraction work). */
export function detectParser(text: string): IntakeParserKey {
  const lower = text.toLowerCase();
  if (ACTIVITY_SCHEDULE_HINTS.some((h) => lower.includes(h))) return "activity_schedule";
  if (SCHOOL_FLYER_HINTS.some((h) => lower.includes(h))) return "school_flyer";
  return "generic";
}

function systemPromptForParser(parser: IntakeParserKey): string {
  switch (parser) {
    case "activity_schedule":
      return ACTIVITY_SCHEDULE_SYSTEM_PROMPT;
    case "school_flyer":
      return SCHOOL_FLYER_SYSTEM_PROMPT;
    default:
      return GENERIC_INTAKE_SYSTEM_PROMPT;
  }
}

function toDraftFields(extraction: IntakeExtraction): Record<string, ExtractedField> {
  const fields: Record<string, ExtractedField> = {};
  for (const [key, field] of Object.entries(extraction.fields)) {
    fields[key] = { value: field.value, confidence: field.confidence };
  }
  return fields;
}

async function extractWithAi(
  supabase: SupabaseClient,
  household: HouseholdRow,
  parser: IntakeParserKey,
  userPrompt: string,
  attachment?: { base64Data: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf" }
): Promise<{ extraction: IntakeExtraction; aiCallResult: AiCallResult }> {
  const aiCallResult = await callAi(supabase, {
    householdId: household.id,
    feature: "universal_intake",
    systemPrompt: systemPromptForParser(parser),
    userPrompt,
    maxTokens: 1024,
    attachment,
  });

  const parsed = parseAiJson(aiCallResult.text);
  if (!parsed.success) {
    throw new Error("Intake parser returned unparseable output");
  }
  const validated = intakeExtractionSchema.safeParse(parsed.data);
  if (!validated.success) {
    throw new Error("Intake parser output didn't match the expected shape");
  }
  return { extraction: validated.data, aiCallResult };
}

/** Text, voice-transcribed text, and forwarded-email bodies all resolve
 * the same way -- voice is already plain text by the time it reaches the
 * server (client-side Web Speech API, unchanged from today), and a
 * forwarded email's body is just text with an optional subject line
 * prepended for extra context. */
export async function parseTextSource(
  supabase: SupabaseClient,
  household: HouseholdRow,
  text: string,
  parserHint?: IntakeParserKey
): Promise<IntakeParseResult> {
  const parser = parserHint ?? detectParser(text);
  const { extraction, aiCallResult } = await extractWithAi(supabase, household, parser, text);
  return {
    parserUsed: parser,
    detectedRecordType: extraction.recordType,
    extractedFields: toDraftFields(extraction),
    overallConfidence: computeOverallConfidence(toDraftFields(extraction)),
    sourceExcerpt: extraction.sourceExcerpt,
    personNameMentioned: extraction.personNameMentioned,
    aiCallResult,
  };
}

export async function parseEmailSource(
  supabase: SupabaseClient,
  household: HouseholdRow,
  subject: string | null,
  bodyText: string
): Promise<IntakeParseResult> {
  const combined = subject ? `Subject: ${subject}\n\n${bodyText}` : bodyText;
  return parseTextSource(supabase, household, combined);
}

/** Image/screenshot/PDF: same three prompts, but the user turn carries the
 * attachment instead of inline text -- see lib/ai/client.ts's `attachment`
 * param. The prompt text itself is a short instruction rather than the
 * source content, since the model reads the source from the attachment. */
export async function parseAttachmentSource(
  supabase: SupabaseClient,
  household: HouseholdRow,
  base64Data: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf",
  parserHint?: IntakeParserKey
): Promise<IntakeParseResult> {
  const parser = parserHint ?? "generic";
  const { extraction, aiCallResult } = await extractWithAi(
    supabase,
    household,
    parser,
    "Extract the structured draft from the attached image/document per your instructions.",
    { base64Data, mediaType }
  );
  return {
    parserUsed: parser,
    detectedRecordType: extraction.recordType,
    extractedFields: toDraftFields(extraction),
    overallConfidence: computeOverallConfidence(toDraftFields(extraction)),
    sourceExcerpt: extraction.sourceExcerpt,
    personNameMentioned: extraction.personNameMentioned,
    aiCallResult,
  };
}

const ICS_INTAKE_WINDOW_DAYS = 365;
const ICS_INTAKE_MAX_OCCURRENCES = 50;

/**
 * Deterministic -- reuses the exact same parser calendar feed sync uses
 * (lib/calendar/ics-import.ts's parseIcsFeed), never reimplemented. No AI
 * call, so every field is reported at confidence 1.0 (the data is exactly
 * what the ICS file said, not a guess). Returns one parse result per
 * occurrence in the file (capped) since intake_drafts is one row per
 * candidate record, same as every other source type -- a large calendar
 * subscription belongs in the existing calendar_feeds feature
 * (lib/calendar/feed-sync.ts), not here; this path is for a one-off
 * forwarded ICS invite or small pasted schedule.
 */
export function parseIcsSource(icsText: string): IntakeParseResult[] {
  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + ICS_INTAKE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const occurrences = parseIcsFeed(icsText, windowStart, windowEnd).slice(0, ICS_INTAKE_MAX_OCCURRENCES);

  return occurrences.map((occ) => {
    const fields: Record<string, ExtractedField> = {
      eventTitle: { value: occ.title, confidence: 1 },
      eventStartsAtISO: { value: occ.startsAt.toISOString(), confidence: 1 },
      eventEndsAtISO: { value: occ.endsAt.toISOString(), confidence: 1 },
      eventAllDay: { value: occ.allDay, confidence: 1 },
    };
    return {
      parserUsed: "ics" as const,
      detectedRecordType: "calendar_event" as const,
      extractedFields: fields,
      overallConfidence: 1,
      sourceExcerpt: `Calendar event: ${occ.title}`,
      personNameMentioned: null,
      aiCallResult: null,
    };
  });
}
