"use client";

// Your own recurring routine (work shifts + time off), managed from Settings
// rather than /people/[id] -- the account owner's own "self" person record
// is intentionally excluded from the People list (P0-5: self is who's using
// the app, not someone they're keeping track of), so without this section
// there was no reachable page to enter a work schedule for yourself even
// though the feature (D-064) already existed for every other household
// member. Reuses the exact same form/list components and server actions as
// the person detail page -- single source of truth, no parallel schedule
// logic.

import { format } from "date-fns";
import {
  AddTimeOffForm,
  AddWorkScheduleForm,
  DeleteTimeOffButton,
  DeleteWorkScheduleButton,
} from "@/app/(app)/people/[id]/person-forms";
import type { TimeOffEntryRow, WorkScheduleRow } from "@/lib/db/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DAY_OF_WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function MySchedule({
  personId,
  workSchedules,
  upcomingTimeOff,
}: {
  personId: string;
  workSchedules: WorkScheduleRow[];
  upcomingTimeOff: TimeOffEntryRow[];
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your work schedule</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            Your usual weekly shifts. This is what lets the weekend planner and daily brief know when you&apos;re
            actually free -- add your regular routine below (work, recurring commitments, anything that blocks off
            the same time every week).
          </p>
          {workSchedules.length > 0 && (
            <div className="flex flex-col gap-1">
              {workSchedules.map((schedule) => (
                <div key={schedule.id} className="flex items-center justify-between text-sm">
                  <p>
                    <span className="font-medium">{DAY_OF_WEEK_LABELS[schedule.day_of_week]}</span>{" "}
                    <span className="text-muted-foreground">
                      {schedule.label} {schedule.start_time}–{schedule.end_time}
                    </span>
                  </p>
                  <DeleteWorkScheduleButton personId={personId} scheduleId={schedule.id} />
                </div>
              ))}
            </div>
          )}
          <AddWorkScheduleForm personId={personId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your time off</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            Vacation, sick days, or anything else that takes you off your usual schedule below. You can also add
            these by just describing them in Quick Capture -- e.g. “I&apos;m off next Friday.”
          </p>
          {upcomingTimeOff.length > 0 && (
            <div className="flex flex-col gap-1">
              {upcomingTimeOff.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-sm">
                  <p>
                    <span className="font-medium">
                      {entry.start_date === entry.end_date
                        ? format(new Date(`${entry.start_date}T00:00:00`), "MMM d")
                        : `${format(new Date(`${entry.start_date}T00:00:00`), "MMM d")}–${format(new Date(`${entry.end_date}T00:00:00`), "MMM d")}`}
                    </span>{" "}
                    {entry.reason && <span className="text-muted-foreground">{entry.reason}</span>}
                  </p>
                  <DeleteTimeOffButton personId={personId} entryId={entry.id} />
                </div>
              ))}
            </div>
          )}
          <AddTimeOffForm personId={personId} />
        </CardContent>
      </Card>
    </>
  );
}
