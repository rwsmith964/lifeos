// POST /api/calendar/custody — create a one-off custody block. A Route
// Handler rather than a Server Action; see lib/hooks/use-form-post.ts and
// DECISIONS.md D-031. For a repeating pattern, see
// /api/calendar/custody/schedules instead (DECISIONS.md D-033).
//
// D-130: accepts one or more child ids (childPersonIds, multi-select —
// falls back to the legacy singular childPersonId for old clients/tests)
// and creates one block per child. Also accepts separate startTime/endTime
// instead of one shared handoverTime (a vacation override needs a real
// departure time and a real return time, not one clock time reused for
// both ends — see DECISIONS.md D-130). Before creating each child's block,
// reconciles it against any existing custody_blocks for that child that
// overlap its span (schedule-generated or a prior one-off alike) so the
// new block becomes the sole authority for its own span instead of
// silently coexisting with a stale, conflicting row — see
// lib/custody/overrides.ts for why this was the root cause of the
// calendar still showing the old custody arrangement after a one-off
// override.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { custodyBlocksRepo } from "@/lib/db/repositories/calendar";
import { custodyBlockInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { reconcileCustodyBlockOverride } from "@/lib/custody/overrides";

export async function POST(request: Request) {
  const { supabase, household } = await requireHouseholdContext();
  const formData = await request.formData();

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  // D-130: separate start/end handover times replace the old single
  // handoverTime field (previously reused for both ends — see the D-130
  // entry in DECISIONS.md). Falls back to the legacy field name for any
  // caller that hasn't switched over, then to 17:00 if nothing at all was
  // sent.
  const legacyHandoverTime = formData.get("handoverTime");
  const startTime = String(formData.get("startTime") ?? legacyHandoverTime ?? "17:00");
  const endTime = String(formData.get("endTime") ?? legacyHandoverTime ?? "17:00");

  const childPersonIds = formData.getAll("childPersonIds").map(String).filter(Boolean);
  if (childPersonIds.length === 0) {
    const legacyChildId = String(formData.get("childPersonId") ?? "");
    if (legacyChildId) childPersonIds.push(legacyChildId);
  }
  if (childPersonIds.length === 0) {
    return NextResponse.json({ error: "Select at least one child." }, { status: 400 });
  }

  if (endDate < startDate) {
    return NextResponse.json({ error: "End date can't be before the start date." }, { status: 400 });
  }

  const startsAt = new Date(`${startDate}T${startTime}:00`).toISOString();
  const endsAt = new Date(`${endDate}T${endTime}:00`).toISOString();
  const responsiblePersonId = String(formData.get("responsiblePersonId") ?? "");
  const blockType = String(formData.get("blockType") ?? "regular");
  const notes = String(formData.get("notes") ?? "");
  const location = String(formData.get("location") ?? "").trim() || null;

  const createdIds: string[] = [];
  for (const childPersonId of childPersonIds) {
    const parsed = custodyBlockInsertSchema.safeParse({
      household_id: household.id,
      child_person_id: childPersonId,
      responsible_person_id: responsiblePersonId,
      starts_at: startsAt,
      ends_at: endsAt,
      block_type: blockType,
      notes,
      location,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    try {
      await reconcileCustodyBlockOverride(supabase, { childPersonId, startsAt, endsAt });
      const block = await custodyBlocksRepo.create(supabase, parsed.data);
      createdIds.push(block.id);
    } catch (error) {
      return NextResponse.json(
        { error: friendlyMutationError(error, { fallback: "Couldn't save this custody block — please try again." }) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ id: createdIds[0], ids: createdIds });
}
