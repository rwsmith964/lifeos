import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { custodySchedulesRepo } from "@/lib/db/repositories/custody-schedules";
import { filterEligibleResponsibleAdults } from "@/lib/custody/eligible-parents";
import { EditScheduleForm, type EditScheduleFormDefaults } from "./edit-schedule-form";

// D-125: edit page for a whole recurring custody schedule (cycle or
// weekly_segments) — mirrors the one-off block edit page's pattern
// (app/(app)/calendar/custody/one-off/[id]/edit/page.tsx) but for the
// recurring definition instead of a single block. This is a full
// re-editor, not a one-off exception: it PATCHes the whole schedule and
// re-materializes its future window.
export default async function EditCustodySchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) notFound();

  const people = await listPeopleForHousehold(supabase, household.id);
  const responsibleCandidates = filterEligibleResponsibleAdults(people);
  const childName = people.find((p) => p.id === schedule.child_person_id)?.full_name ?? "this child";

  const defaults: EditScheduleFormDefaults =
    schedule.recurrence_type === "weekly_segments" && schedule.weekly_segments
      ? {
          recurrenceType: "weekly_segments",
          weeklySegments: schedule.weekly_segments,
          handoverLocation: schedule.handover_location ?? "",
          startDate: schedule.start_date,
          endDate: schedule.end_date ?? "",
        }
      : {
          recurrenceType: "cycle",
          cycleLengthDays: schedule.cycle_length_days ?? 7,
          cycleAssignments: schedule.cycle_assignments ?? [],
          anchorDate: schedule.anchor_date ?? schedule.start_date,
          handoverTime: schedule.handover_time,
          customHandoverTimes: schedule.custom_handover_times,
          handoverLocation: schedule.handover_location ?? "",
          startDate: schedule.start_date,
          endDate: schedule.end_date ?? "",
        };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href={`/calendar/custody/${id}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Back to schedule
      </Link>
      <h1 className="text-xl font-semibold">Edit {childName}&rsquo;s schedule</h1>
      <p className="text-sm text-muted-foreground">
        This changes the whole recurring pattern going forward. Existing exceptions on individual days are kept.
      </p>
      <EditScheduleForm scheduleId={id} responsibleCandidates={responsibleCandidates} defaults={defaults} />
    </div>
  );
}
