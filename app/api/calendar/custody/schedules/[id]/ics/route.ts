// GET /api/calendar/custody/schedules/[id]/ics — downloads a one-year
// .ics snapshot of a custody schedule (respecting any saved exceptions)
// so it can be imported into any calendar app, e.g. by a co-parent who
// has no LifeOS account of their own. See lib/custody/ics.ts.
import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { custodySchedulesRepo, listExceptionsForSchedule } from "@/lib/db/repositories/custody-schedules";
import { projectCustodySchedule } from "@/lib/custody/schedule";
import { mergeCustodyRuns, buildCustodyIcs } from "@/lib/custody/ics";

const EXPORT_WINDOW_DAYS = 365;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, household } = await requireHouseholdContext();
  const { id } = await params;

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  const [people, exceptions] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    listExceptionsForSchedule(supabase, id),
  ]);
  const peopleNamesById = new Map(people.map((p) => [p.id, p.nickname || p.full_name]));
  const exceptionsByDate = new Map(exceptions.map((e) => [e.exception_date, e.responsible_person_id]));

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = addDays(windowStart, EXPORT_WINDOW_DAYS);

  const days = projectCustodySchedule(
    {
      cycleLengthDays: schedule.cycle_length_days,
      cycleAssignments: schedule.cycle_assignments,
      anchorDate: schedule.anchor_date,
      startDate: schedule.start_date,
      endDate: schedule.end_date,
    },
    exceptionsByDate,
    windowStart,
    windowEnd
  );
  const runs = mergeCustodyRuns(days);

  const childName = peopleNamesById.get(schedule.child_person_id) ?? "Custody";
  const ics = buildCustodyIcs({ scheduleId: schedule.id, childName, runs, peopleNamesById });

  const filename = `${childName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-custody-schedule.ics`;
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
