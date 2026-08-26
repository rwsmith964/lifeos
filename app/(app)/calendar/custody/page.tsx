import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listCustodySchedulesForHousehold } from "@/lib/db/repositories/custody-schedules";
import { listCustodyBlocksForHouseholdInRange } from "@/lib/db/repositories/calendar";
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
  const upcomingBlocks = await listCustodyBlocksForHouseholdInRange(
    supabase,
    household.id,
    now.toISOString(),
    new Date(now.getTime() + 14 * 86400000).toISOString()
  );

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
                  <DeleteScheduleButton scheduleId={schedule.id} />
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Next 14 days</h2>
        {upcomingBlocks.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">Nothing scheduled.</CardContent>
          </Card>
        ) : (
          upcomingBlocks.map((block) => {
            const color = childColors.get(block.child_person_id);
            return (
              <Card key={block.id}>
                <CardContent className="flex items-center justify-between gap-2">
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
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
