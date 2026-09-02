// GET /api/calendar/custody/schedules/[id]/ics — downloads a one-year
// .ics snapshot of a custody schedule (respecting any saved exceptions)
// so it can be imported into any calendar app, e.g. by a co-parent who
// has no LifeOS account of their own. See lib/custody/ics.ts. Branches on
// recurrence_type: 'cycle' schedules export as all-day events (unchanged
// from before); 'weekly_segments' schedules export as timed events since
// a day can be split between two people at an exact handoff time (D-125).
import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { custodySchedulesRepo, listExceptionsForSchedule } from "@/lib/db/repositories/custody-schedules";
import { projectCustodySchedule, projectWeeklySegmentSchedule } from "@/lib/custody/schedule";
import { mergeCustodyRuns, buildCustodyIcs, buildTimedCustodyIcs } from "@/lib/custody/ics";

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

  const childName = peopleNamesById.get(schedule.child_person_id) ?? "Custody";

  let ics: string;
  if (schedule.recurrence_type === "weekly_segments" && schedule.weekly_segments) {
    ics = buildTimedCustodyIcs({
      scheduleId: schedule.id,
      childName,
      intervals: projectWeeklySegmentSchedule(
        schedule.weekly_segments,
        schedule.start_date,
        schedule.end_date,
        exceptionsByDate,
        windowStart,
        windowEnd
      ),
      peopleNamesById,
    });
  } else if (schedule.cycle_length_days != null && schedule.cycle_assignments && schedule.anchor_date != null) {
    ics = buildCustodyIcs({
      scheduleId: schedule.id,
      childName,
      runs: mergeCustodyRuns(
        projectCustodySchedule(
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
        )
      ),
      peopleNamesById,
    });
  } else {
    // Defensive only — the DB check constraint (custody_schedules_recurrence_fields_check)
    // guarantees every row satisfies one branch above.
    return NextResponse.json({ error: "This schedule is missing its recurrence definition." }, { status: 500 });
  }

  const filename = `${childName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-custody-schedule.ics`;
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
