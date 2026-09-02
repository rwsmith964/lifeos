// PATCH /api/calendar/custody/[id] — edit an existing one-off custody
// block. Mirrors PATCH /api/calendar/events/[id] (D-056). D-097: closes
// the "custody blocks are add/delete only, no edit" gap.
//
// Deliberately refuses to edit a schedule-generated block
// (custody_schedule_id set) rather than silently letting the edit get
// wiped: materializeCustodySchedule (lib/custody/materialize.ts) deletes
// and re-inserts a schedule's entire future window on every
// re-materialization (e.g. adding/editing/deleting any exception on that
// schedule, or editing the schedule itself), which would overwrite a
// direct field edit with no warning. The correct "edit one day" tool for
// a schedule-generated block is a schedule exception
// (/calendar/custody/[scheduleId], ExceptionForm) — see
// custody-block-form's sibling UI on the calendar day view.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { custodyBlocksRepo } from "@/lib/db/repositories/calendar";
import { custodyBlockUpdateSchema } from "@/lib/db/schemas";
import { reconcileCustodyBlockOverride } from "@/lib/custody/overrides";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const existing = await custodyBlocksRepo.getById(supabase, id);
  if (!existing || existing.household_id !== household.id) {
    return NextResponse.json({ error: "Custody block not found." }, { status: 404 });
  }
  if (existing.custody_schedule_id) {
    return NextResponse.json(
      { error: "This block comes from a recurring schedule — add an exception on that schedule instead of editing it directly." },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  // D-130: separate start/end handover times — see the POST route for why.
  // Falls back to the legacy shared handoverTime field, then to the
  // block's own current time-of-day so an old client that only ever sends
  // one field doesn't silently shift the other end to 17:00.
  const legacyHandoverTime = formData.get("handoverTime");
  const existingStartTime = existing.starts_at.slice(11, 16);
  const existingEndTime = existing.ends_at.slice(11, 16);
  const startTime = String(formData.get("startTime") ?? legacyHandoverTime ?? existingStartTime);
  const endTime = String(formData.get("endTime") ?? legacyHandoverTime ?? existingEndTime);

  if (endDate < startDate) {
    return NextResponse.json({ error: "End date can't be before the start date." }, { status: 400 });
  }

  const childPersonId = String(formData.get("childPersonId") ?? "");
  const startsAt = new Date(`${startDate}T${startTime}:00`).toISOString();
  const endsAt = new Date(`${endDate}T${endTime}:00`).toISOString();

  const parsed = custodyBlockUpdateSchema.safeParse({
    child_person_id: childPersonId,
    responsible_person_id: String(formData.get("responsiblePersonId") ?? ""),
    starts_at: startsAt,
    ends_at: endsAt,
    block_type: String(formData.get("blockType") ?? "regular"),
    notes: String(formData.get("notes") ?? ""),
    location: String(formData.get("location") ?? "").trim() || null,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    // D-130: reconcile against any other block for this child that now
    // overlaps the edited span, excluding this block itself so it doesn't
    // get reconciled against its own pre-edit row.
    await reconcileCustodyBlockOverride(supabase, {
      childPersonId,
      startsAt,
      endsAt,
      excludeBlockId: id,
    });
    const block = await custodyBlocksRepo.update(supabase, id, parsed.data);
    return NextResponse.json({ id: block.id });
  } catch (error) {
    console.error(`PATCH /api/calendar/custody/${id} failed:`, error);
    return NextResponse.json({ error: "Couldn't save changes — please try again." }, { status: 500 });
  }
}
