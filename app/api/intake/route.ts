// Module 3 (D-119, universal_intake_v2 flag) -- Universal Intake's single
// ingestion endpoint. Accepts text, voice-transcribed text, a forwarded
// email body, a pasted ICS snippet, or a base64 image/screenshot/PDF, and
// turns it into one or more intake_drafts rows -- never a committed
// record (see lib/intake/convert.ts for where an APPROVED draft becomes
// one). Gated by universal_intake_v2: with the flag off this route
// returns 404, satisfying the brief's acceptance criterion "with intake
// off, no ingestion routes exist" as closely as a running server can
// (logged as part of QUESTIONS.md QUEUE-007's interpretation).
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { isAiConfigured, AiUnavailableError, AiBudgetExceededError } from "@/lib/ai/client";
import { intakeRequestSchema } from "@/lib/db/schemas";
import { intakeDraftsRepo } from "@/lib/db/repositories/intake";
import {
  parseTextSource,
  parseEmailSource,
  parseAttachmentSource,
  parseIcsSource,
  type IntakeParseResult,
} from "@/lib/intake/parse";
import { meetsReviewThreshold, getReviewThreshold } from "@/lib/intake/confidence";
import { NON_CONVERTIBLE_TYPES } from "@/lib/intake/convert";
import type { IntakeDraftInsert, IntakeDraftRow } from "@/lib/db/database.types";

function draftStatusFor(result: IntakeParseResult): IntakeDraftRow["status"] {
  if (result.detectedRecordType === "ambiguous") return "needs_review";
  if (result.detectedRecordType && (NON_CONVERTIBLE_TYPES as readonly string[]).includes(result.detectedRecordType)) {
    return "needs_review";
  }
  const threshold = getReviewThreshold(null); // household-level override not yet built, see QUESTIONS.md
  return meetsReviewThreshold(result.overallConfidence, threshold) ? "ready" : "needs_review";
}

export async function POST(request: Request) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "universal_intake_v2");
  if (!enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request body" }, { status: 400 });
  }

  const validated = intakeRequestSchema.safeParse(rawBody);
  if (!validated.success) {
    return NextResponse.json({ status: "error", message: "That submission is missing required fields for its type." }, { status: 400 });
  }
  const body = validated.data;

  if (body.sourceType !== "ics" && !isAiConfigured()) {
    return NextResponse.json({ status: "unavailable", message: "Intake is temporarily unavailable. Try again in a few minutes." });
  }

  let results: IntakeParseResult[];
  let sourceType: IntakeDraftInsert["source_type"];
  try {
    switch (body.sourceType) {
      case "text":
      case "voice":
        sourceType = body.sourceType;
        results = [await parseTextSource(supabase, household, body.text)];
        break;
      case "email":
        sourceType = "email";
        results = [await parseEmailSource(supabase, household, body.subject ?? null, body.bodyText)];
        break;
      case "ics":
        sourceType = "ics";
        results = parseIcsSource(body.icsText);
        if (results.length === 0) {
          return NextResponse.json({
            status: "empty",
            message: "That calendar file didn't have any upcoming events in it.",
          });
        }
        break;
      case "image":
      case "screenshot":
      case "pdf":
        sourceType = body.sourceType;
        results = [await parseAttachmentSource(supabase, household, body.base64Data, body.mediaType)];
        break;
    }
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json({ status: "unavailable", message: "Intake is temporarily unavailable. Try again in a few minutes." });
    }
    if (error instanceof AiBudgetExceededError) {
      return NextResponse.json({
        status: "unavailable",
        message: "Today's AI budget for this household has been reached — try again tomorrow.",
      });
    }
    console.error("Intake parse failed:", error);
    return NextResponse.json({
      status: "error",
      message: "Couldn't make sense of that submission — try a clearer excerpt or a different format.",
    });
  }

  const createdDrafts: IntakeDraftRow[] = [];
  for (const result of results) {
    const draft = await intakeDraftsRepo.create(supabase, {
      household_id: household.id,
      created_by_person_id: selfPerson.id,
      source_type: sourceType,
      parser_used: result.parserUsed,
      detected_record_type: result.detectedRecordType,
      extracted_fields: result.extractedFields,
      overall_confidence: result.overallConfidence,
      source_excerpt: result.sourceExcerpt,
      status: draftStatusFor(result),
    });
    createdDrafts.push(draft);
  }

  return NextResponse.json({
    status: "created",
    drafts: createdDrafts.map((d) => ({
      id: d.id,
      status: d.status,
      detectedRecordType: d.detected_record_type,
      overallConfidence: d.overall_confidence,
      sourceExcerpt: d.source_excerpt,
    })),
  });
}
