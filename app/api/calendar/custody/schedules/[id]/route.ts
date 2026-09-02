// DELETE /api/calendar/custody/schedules/[id] — remove a recurring
// schedule and its own future-window blocks (past blocks stay as
// history, orphaned via custody_blocks.custody_schedule_id ON DELETE SET
// NULL at the DB level, but deleted explicitly here first so "delete this
// schedule" actually stops it from covering future days).
//
// PATCH /api/calendar/custody/schedules/[id] — replace a schedule's whole
// recurring definition (cycle or weekly_segments) and re-materialize its
// future-window custody_blocks. See DECISIONS.md D-125.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { custodySchedulesRepo } from "@/lib/db/repositories/custody-schedules";
import { custodyScheduleUpdateSchema } from "@/lib/db/schemas";
import { materializeCustodySchedule } from "@/lib/custody/materialize";
import { friendlyMutationError } from "@/lib/db/errors";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, household } = await requireHouseholdContext();
  const { id } = await params;

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  try {
    const { error: deleteBlocksError } = await supabase
      .from("custody_blocks")
      .delete()
      .eq("custody_schedule_id", id)
      .gte("starts_at", new Date().toISOString());
    if (deleteBlocksError) throw deleteBlocksError;

    await custodySchedulesRepo.remove(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyMutationError(error, { fallback: "Couldn't delete this schedule — please try again." }) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, household } = await requireHouseholdContext();
  const { id } = await params;

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = custodyScheduleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    // A full replace of the recurring definition — switching recurrence_type
    // (e.g. cycle -> weekly_segments) is allowed; whichever fields the new
    // type doesn't use are explicitly nulled by the schema so the DB check
    // constraint (custody_schedules_recurrence_fields_check) stays satisfied.
    const updated = await custodySchedulesRepo.update(supabase, id, parsed.data);
    const { blocksCreated } = await materializeCustodySchedule(supabase, updated);
    return NextResponse.json({ id: updated.id, blocksCreated });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyMutationError(error, { fallback: "Couldn't save this schedule — please try again." }) },
      { status: 500 }
    );
  }
}
