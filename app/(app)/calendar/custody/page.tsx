import Link from "next/link";
import { AlertTriangle, ArrowLeft, Plus } from "lucide-react";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listCustodySchedulesForHousehold } from "@/lib/db/repositories/custody-schedules";
import { listCustodyBlocksForHouseholdInRange } from "@/lib/db/repositories/calendar";
import { listWorkSchedulesForPeople, listTimeOffForPeopleInRange } from "@/lib/db/repositories/work-schedule";
import { workShiftsInRange, timeOffInRange, workShiftTitle, timeOffTitle } from "@/lib/calendar/work-schedule";
import { detectCustodyWorkConflicts } from "@/lib/custody/conflicts";
import { buildChildColorMap } from "@/lib/custody/colors";
import { CUSTODY_PRESET_LABELS, type CustodyPresetName } from "@/lib/custody/schedule";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteScheduleButton } from "./delete-schedule-button";

/** Recognizes a schedule's cycle as matching one of the named presets, purely for a friendlier label — falls back to "Custom" for anything else, which is exactly the point of the generic engine (brief 2.5/Phase 2 intro). */
function detectPresetLabel(cycleLengthDays: number, cycleAssignments: { dayIndex: number; responsiblePersonId: string }[]): string {
  if (cycleLengthDays !== 14) return "Custom pattern";
  const byIndex = new Map(cycleAssignments.map((a) => [a.dayIndex, a.responsiblePersonId]));
  const parents = [...new Set(cycleAssignments.map((a) => a.responsiblePersonId))];
  if (parents.length !== 2) return "Custom pattern";
  const [a, b] = parents;
  const matches = (preset: CustodyPresetName, primary: string, secondary: string) => {
    const zones: Record<CustodyPresetName, [number[], number[]]> = {
      week_on_week_off: [[0, 1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12, 13]],
      alternating_weekends: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [12, 13]],
      two_two_three: [[0, 1, 4, 5, 6, 9, 10], [2, 3, 7, 8, 11, 12, 13]],
      two_two_five_five: [[0, 1, 4, 5, 6, 7, 8], [2, 3, 9, 10, 11, 12, 13]],
    };
    const [primaryDays, secondaryDays] = zones[preset];
    return (
      primaryDays.every((i) => byIndex.get(i) === primary) && secondaryDays.every((i) => byIndex.get(i) === secondary)
    );
  };
  for (const preset of Object.keys(CUSTODY_PRESET_LABELS) as CustodyPresetName[]) {
    if (matches(preset, a, b) || matches(preset, b, a)) return CUSTODY_PRESET_LABELS[preset];
  }
  return "Custom pattern";
}

export default async function CustodyHubPage() {
  const { supabase, household } = await requireHouseholdContext();
  const [people, schedules] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    listCustodySchedulesForHousehold(supabase, household.id),
  ]);
  const peopleById = new Map(people.map((p) => [p.id, p.nickname || p.full_name]));
  const childColors = buildChildColorMap(people.filter((p) => p.relationship_type === "child").map((p) => p.id));

  const now = new Date();
  const rangeEnd = new Date(now.getTime() + 14 * 86400000);
  const householdPersonIds = people.map((p) => p.id);
  const [upcomingBlocks, workSchedules, timeOffEntries] = await Promise.all([
    listCustodyBlocksForHouseholdInRange(supabase, household.id, now.toISOString(), rangeEnd.toISOString()),
    // D-068: fetched for every household person regardless of their
    // show_work_schedule_on_calendar toggle -- that flag only controls the
    // main /calendar view. The custody calendar's whole point is to reveal
    // scheduling conflicts, so it deliberately always sees every shift.
    listWorkSchedulesForPeople(supabase, householdPersonIds),
    listTimeOffForPeopleInRange(supabase, householdPersonIds, format(now, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")),
  ]);

  const coParents = people.filter((p) => p.relationship_type === "co_parent");
  const coParentIds = new Set(coParents.map((p) => p.id));
  const coParentSchedules = workSchedules.filter((s) => coParentIds.has(s.person_id));
  const coParentTimeOff = timeOffEntries.filter((t) => coParentIds.has(t.person_id));
  const coParentShifts = workShiftsInRange(coParentSchedules, timeOffEntries, people, now, rangeEnd);
  const coParentDaysOff = timeOffInRange(coParentTimeOff, people, now, rangeEnd);

  const conflicts = detectCustodyWorkConflicts(upcomingBlocks, workSchedules, timeOffEntries, people);
  const conflictsByBlockId = new Map<string, typeof conflicts>();
  for (const conflict of conflicts) {
    const existing = conflictsByBlockId.get(conflict.custodyBlockId) ?? [];
    existing.push(conflict);
    conflictsByBlockId.set(conflict.custodyBlockId, existing);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href="/calendar" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Calendar
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Custody</h1>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/calendar/custody/one-off">One-off</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/calendar/custody/new">
              <Plus className="size-4" /> New schedule
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recurring schedules</h2>
        {schedules.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              No recurring schedule yet. Real custody arrangements (2-2-3, alternating weekends, week-on/week-off) belong
              here — a one-off block is for single exceptions only.
            </CardContent>
          </Card>
        ) : (
          schedules.map((schedule) => {
            const color = childColors.get(schedule.child_person_id);
            return (
              <Card key={schedule.id}>
                <CardContent className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      {color && <span className={`size-2 rounded-full ${color.dot}`} />}
                      <p className="text-sm font-medium">{peopleById.get(schedule.child_person_id) ?? "Unknown child"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {detectPresetLabel(schedule.cycle_length_days, schedule.cycle_assignments)} · handover{" "}
                      {schedule.handover_time.slice(0, 5)}
                      {schedule.handover_location && ` at ${schedule.handover_location}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      From {format(new Date(`${schedule.start_date}T00:00:00`), "MMM d, yyyy")}
                      {schedule.end_date ? ` to ${format(new Date(`${schedule.end_date}T00:00:00`), "MMM d, yyyy")}` : " · ongoing"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/calendar/custody/${schedule.id}`}>Manage</Link>
                    </Button>
                    <DeleteScheduleButton scheduleId={schedule.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {coParents.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {coParents.length === 1 ? `${peopleById.get(coParents[0].id) ?? "Co-parent"}'s schedule` : "Co-parents' schedules"}
          </h2>
          {coParentShifts.length === 0 && coParentDaysOff.length === 0 ? (
            <Card>
              <CardContent className="text-sm text-muted-foreground">
                No work shifts or time off on file for the next 14 days.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-1.5">
                {[...coParentShifts.map((s) => ({ date: s.date, text: workShiftTitle(s), key: `shift-${s.scheduleId}-${s.date.toISOString()}` }))]
                  .concat(
                    coParentDaysOff.map((t) => ({ date: t.date, text: timeOffTitle(t), key: `off-${t.entryId}-${t.date.toISOString()}` }))
                  )
                  .sort((a, b) => a.date.getTime() - b.date.getTime())
                  .map((item) => (
                    <p key={item.key} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{format(item.date, "EEE, MMM d")}</span> — {item.text}
                    </p>
                  ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Next 14 days</h2>
        {upcomingBlocks.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">Nothing scheduled.</CardContent>
          </Card>
        ) : (
          upcomingBlocks.map((block) => {
            const color = childColors.get(block.child_person_id);
            const blockConflicts = conflictsByBlockId.get(block.id) ?? [];
            return (
              <Card key={block.id} className={blockConflicts.length > 0 ? "border-amber-500" : undefined}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {color && <span className={`size-2 rounded-full ${color.dot}`} />}
                      <div>
                        <p className="text-sm font-medium">
                          {peopleById.get(block.child_person_id) ?? "Unknown"} with{" "}
                          {peopleById.get(block.responsible_person_id) ?? "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(block.starts_at), "EEE, MMM d")} – {format(new Date(block.ends_at), "EEE, MMM d, h:mm a")}
                          {block.location && ` · ${block.location}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{block.block_type}</Badge>
                  </div>
                  {blockConflicts.map((conflict) => (
                    <div
                      key={`${conflict.custodyBlockId}-${conflict.overlapStart.toISOString()}`}
                      className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {conflict.responsiblePersonName} is scheduled to work ({conflict.shiftLabel}{" "}
                        {format(conflict.overlapStart, "h:mm a")}–{format(conflict.overlapEnd, "h:mm a")}) during this custody
                        block.
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
