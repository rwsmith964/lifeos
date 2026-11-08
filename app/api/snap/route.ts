// POST /api/snap -- the always-visible camera button. Reads one photo and
// decides where it belongs: an invitation (returned for the rich "Add from a
// photo" confirmation flow) or any other kind of record (saved as a draft the
// person confirms in the sheet). Nothing reaches the calendar, gifts or people
// until they confirm. Not gated on the universal_intake_v2 flag.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { AiBudgetExceededError, AiUnavailableError, isAiConfigured } from "@/lib/ai/client";
import { parseAttachmentSource } from "@/lib/intake/parse";
import { parseInviteImage } from "@/lib/invites/parse";
import { intakeDraftsRepo } from "@/lib/db/repositories/intake";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { FIELD_KEYS_HANDLED_ELSEWHERE, labelForField } from "@/lib/intake/labels";
import { isConvertibleRecordType } from "@/lib/intake/snap";

const bodySchema = z.object({
  base64Data: z.string().min(100),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

const MAX_BASE64_CHARS = 3_500_000;
const UNAVAILABLE = "Reading photos is temporarily unavailable. Try again in a few minutes.";

export async function POST(request: Request) {
  const { supabase, household, selfPerson, timezone } = await requireHouseholdContext();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) {
    return NextResponse.json({ status: "error", message: "That doesn't look like a photo — try again." }, { status: 400 });
  }
  if (body.data.base64Data.length > MAX_BASE64_CHARS) {
    return NextResponse.json({ status: "error", message: "That photo is too large — try a smaller one." }, { status: 413 });
  }
  if (!isAiConfigured()) return NextResponse.json({ status: "unavailable", message: UNAVAILABLE });

  try {
    const parsed = await parseAttachmentSource(
      supabase,
      household,
      body.data.base64Data,
      body.data.mediaType,
      undefined,
      timezone
    );

    // A dated event may be an invitation: hand it to the dedicated reader,
    // which also pulls out registry details, who it's addressed to and RSVP.
    if (parsed.detectedRecordType === "calendar_event") {
      try {
        const invite = await parseInviteImage(supabase, household.id, body.data.base64Data, body.data.mediaType, timezone);
        if (invite.date) return NextResponse.json({ status: "invite", invite });
      } catch (error) {
        if (error instanceof AiUnavailableError || error instanceof AiBudgetExceededError) throw error;
        // fall through to the generic draft
      }
    }

    const draft = await intakeDraftsRepo.create(supabase, {
      household_id: household.id,
      created_by_person_id: selfPerson.id,
      source_type: "image",
      parser_used: parsed.parserUsed,
      detected_record_type: parsed.detectedRecordType,
      extracted_fields: parsed.extractedFields,
      overall_confidence: parsed.overallConfidence,
      source_excerpt: parsed.sourceExcerpt,
      status: "needs_review",
    });

    const people = (await listPeopleForHousehold(supabase, household.id)).filter((p) => !p.is_archived);
    return NextResponse.json({
      status: "draft",
      draft: {
        id: draft.id,
        recordType: parsed.detectedRecordType,
        convertible: isConvertibleRecordType(parsed.detectedRecordType),
        excerpt: parsed.sourceExcerpt,
        mentionedName: parsed.personNameMentioned,
        fields: Object.entries(parsed.extractedFields)
          .filter(([key]) => !FIELD_KEYS_HANDLED_ELSEWHERE.has(key))
          .map(([key, field]) => ({ key, label: labelForField(key), value: field.value })),
      },
      people: people.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        nickname: p.nickname,
        relationship_type: p.relationship_type,
        relationship_label: p.relationship_label,
      })),
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) return NextResponse.json({ status: "unavailable", message: UNAVAILABLE });
    if (error instanceof AiBudgetExceededError) {
      return NextResponse.json({ status: "unavailable", message: "Today's AI budget for this household has been reached — try again tomorrow." });
    }
    console.error("Snap parse failed:", error);
    return NextResponse.json({
      status: "error",
      message: "Couldn't make sense of that photo — try a clearer, straight-on picture.",
    });
  }
}
