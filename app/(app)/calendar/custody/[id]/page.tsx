import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listExceptionsForSchedule, custodySchedulesRepo } from "@/lib/db/repositories/custody-schedules";
import { filterEligibleResponsibleAdults } from "@/lib/custody/eligible-parents";
import { MATERIALIZE_WINDOW_DAYS } from "@/lib/custody/materialize";
import { describeCustodyHandoverTimes, findGaps, projectCustodySchedule } from "@/lib/custody/schedule";
import { Card, CardContent } from "@/components/ui/card";
import { ExceptionForm } from "./exception-form";
import { DeleteExceptionButton } from "./delete-exception-button";

export default async function CustodyScheduleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  // D-097: when a schedule-generated custody block's edit pencil is
  // clicked on the calendar day view, it lands here with that day
  // pre-filled below — an exception is the correct "edit just this day"
  // tool for a materialized block (see app/api/calendar/custody/[id]/route.ts).
  const { date: prefillDate } = await searchParams;
  const { supabase, household } = await requireHouseholdContext();

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) notFound();

  const [people, exceptions] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    listExceptionsForSchedule(supabase, id),
  ]);
  const peopleById = new Map(people.map((p) => [p.id, p.nickname || p.full_name]));
  const responsibleCandidates = filterEligibleResponsibleAdults(people);

  // Same window materializeCustodySchedule actually fills — a gap here is
  // a gap in the real calendar, not just a preview artifact. Surfaces
  // KNOWN-ISSUES.md 2.x: findGaps was only ever shown at creation time,
  // never re-checked against an existing schedule (e.g. after an edited
  // end_date, or a custom cycle with an unfilled day index).
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + MATERIALIZE_WINDOW_DAYS);
  const exceptionsByDate = new Map(exceptions.map((e) => [e.exception_date, e.responsible_person_id]));
  const projectedDays = projectCustodySchedule(
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
  const gaps = findGaps(projectedDays, windowStart, windowEnd);

  const sortedExceptions = [...exceptions].sort((a, b) => a.exception_date.localeCompare(b.exception_date));

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href="/calendar/custody" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Custody
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{peopleById.get(schedule.child_person_id) ?? "Unknown child"}&rsquo;s schedule</h1>
          <p className="text-sm text-muted-foreground">
            {describeCustodyHandoverTimes(schedule)}
            {schedule.handover_location && ` at ${schedule.handover_location}`} · from{" "}
            {format(new Date(`${schedule.start_date}T00:00:00`), "MMM d, yyyy")}
            {schedule.end_date ? ` to ${format(new Date(`${schedule.end_date}T00:00:00`), "MMM d, yyyy")}` : " · ongoing"}
          </p>
        </div>
        <a
          href={`/api/calendar/custody/schedules/${schedule.id}/ics`}
          className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          download
        >
          <Download className="size-3.5" /> Export .ics
        </a>
      </div>

      {gaps.length > 0 && (
        <Card className="border-amber-500/50">
          <CardContent className="text-sm text-amber-600 dark:text-amber-400">
            {gaps.length === 1 ? "1 stretch" : `${gaps.length} stretches`} in the next {MATERIALIZE_WINDOW_DAYS} days
            {gaps.length === 1 ? " has" : " have"} no one assigned:{" "}
            {gaps
              .map((g) =>
                g.startDate === g.endDate
                  ? format(new Date(`${g.startDate}T00:00:00`), "MMM d")
                  : `${format(new Date(`${g.startDate}T00:00:00`), "MMM d")}–${format(new Date(`${g.endDate}T00:00:00`), "MMM d")}`
              )
              .join(", ")}
            . This usually means the schedule&rsquo;s end date is coming up, or a custom cycle has an unfilled day.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Exceptions</h2>
        <p className="text-xs text-muted-foreground">
          Override a single day — e.g. a holiday swap — without changing the underlying recurring cycle.
        </p>
        {prefillDate && (
          <p className="text-xs text-muted-foreground">
            Change who has custody on {format(new Date(`${prefillDate}T00:00:00`), "EEEE, MMM d, yyyy")} using the form below.
          </p>
        )}
        {sortedExceptions.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">No exceptions yet.</CardContent>
          </Card>
        ) : (
          sortedExceptions.map((exception) => (
            <Card key={exception.id}>
              <CardContent className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {format(new Date(`${exception.exception_date}T00:00:00`), "EEEE, MMM d, yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    With {peopleById.get(exception.responsible_person_id) ?? "Unknown"}
                    {exception.reason && ` · ${exception.reason}`}
                  </p>
                </div>
                <DeleteExceptionButton scheduleId={schedule.id} exceptionId={exception.id} />
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {responsibleCandidates.length > 0 && (
        <Card>
          <CardContent>
            <ExceptionForm scheduleId={schedule.id} responsibleCandidates={responsibleCandidates} initialDate={prefillDate} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
