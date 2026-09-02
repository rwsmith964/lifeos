"use client";

// Full re-editor for an existing custody schedule's recurring definition
// (PATCH /api/calendar/custody/schedules/[id]) — see DECISIONS.md D-125.
// Unlike the one-off exception form on the schedule detail page, this
// changes the whole pattern going forward, not a single day. Supports
// switching recurrence_type between 'cycle' and 'weekly_segments';
// whichever fields the new type doesn't use are nulled by the schema on
// save. child_person_id is immutable here — create a new schedule if a
// custody arrangement needs to move to a different child.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { CustodyCycleAssignment, CustodyWeeklySegment } from "@/lib/db/database.types";
import type { PersonRow } from "@/lib/db/database.types";
import { describeWeeklySegmentsPattern, findGaps, formatHandoverTime, projectCustodySchedule } from "@/lib/custody/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  emptyWeeklySegmentsState,
  findWeeklySegmentsGaps,
  weeklySegmentDefinitionsToState,
  weeklySegmentsStateToDefinitions,
  WeeklySegmentsEditor,
  type WeeklySegmentsState,
} from "../../weekly-segments-editor";

const selectClass = "border-input h-9 rounded-md border bg-transparent px-3 text-sm";
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Postgres `time` columns (handover_time) round-trip through Supabase as
// "HH:MM:SS", but custodyScheduleUpdateSchema's handoverTimeSchema requires
// exact "HH:MM". Without this, loading the edit form and saving without
// touching the (already-filled) handover time fields fails validation on
// every save. custom_handover_times is jsonb and already stores clean
// "HH:MM", but normalizing defensively here costs nothing.
function normalizeTime(t: string): string {
  return t.slice(0, 5);
}

type RecurrenceMode = "cycle" | "weekly_segments";

export type EditScheduleFormDefaults =
  | {
      recurrenceType: "weekly_segments";
      weeklySegments: CustodyWeeklySegment[];
      handoverLocation: string;
      startDate: string;
      endDate: string;
    }
  | {
      recurrenceType: "cycle";
      cycleLengthDays: number;
      cycleAssignments: CustodyCycleAssignment[];
      anchorDate: string;
      handoverTime: string;
      customHandoverTimes: Record<string, string> | null;
      handoverLocation: string;
      startDate: string;
      endDate: string;
    };

export function EditScheduleForm({
  scheduleId,
  responsibleCandidates,
  defaults,
}: {
  scheduleId: string;
  responsibleCandidates: PersonRow[];
  defaults: EditScheduleFormDefaults;
}) {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");

  const [mode, setMode] = useState<RecurrenceMode>(defaults.recurrenceType);

  // Cycle mode state
  const [cycleLengthDays, setCycleLengthDays] = useState(defaults.recurrenceType === "cycle" ? defaults.cycleLengthDays : 7);
  const [cycleAssignments, setCycleAssignments] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    if (defaults.recurrenceType === "cycle") {
      for (const a of defaults.cycleAssignments) map[a.dayIndex] = a.responsiblePersonId;
    }
    return map;
  });
  const [anchorDate, setAnchorDate] = useState(defaults.recurrenceType === "cycle" ? defaults.anchorDate : today);
  const [handoverTime, setHandoverTime] = useState(
    defaults.recurrenceType === "cycle" ? normalizeTime(defaults.handoverTime) : "17:00"
  );
  const [customHandoverOverrides, setCustomHandoverOverrides] = useState<Record<string, string>>(() => {
    if (defaults.recurrenceType !== "cycle" || !defaults.customHandoverTimes) return {};
    return Object.fromEntries(Object.entries(defaults.customHandoverTimes).map(([day, time]) => [day, normalizeTime(time)]));
  });

  // weekly_segments mode state
  const [segmentsState, setSegmentsState] = useState<WeeklySegmentsState>(
    defaults.recurrenceType === "weekly_segments" ? weeklySegmentDefinitionsToState(defaults.weeklySegments) : emptyWeeklySegmentsState()
  );

  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [handoverLocation, setHandoverLocation] = useState(defaults.handoverLocation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const peopleById = useMemo(() => new Map(responsibleCandidates.map((p) => [p.id, p.nickname || p.full_name])), [responsibleCandidates]);

  const cycleAssignmentList: CustodyCycleAssignment[] = useMemo(
    () =>
      Object.entries(cycleAssignments)
        .filter(([, personId]) => personId)
        .map(([dayIndex, responsiblePersonId]) => ({ dayIndex: Number(dayIndex), responsiblePersonId })),
    [cycleAssignments]
  );

  const segmentsDefinitions = useMemo(() => weeklySegmentsStateToDefinitions(segmentsState), [segmentsState]);
  const segmentsGaps = useMemo(() => findWeeklySegmentsGaps(segmentsState), [segmentsState]);
  const segmentsSummary = useMemo(
    () => (segmentsDefinitions.length > 0 ? describeWeeklySegmentsPattern(segmentsDefinitions, peopleById) : ""),
    [segmentsDefinitions, peopleById]
  );

  const preview = useMemo(() => {
    if (mode !== "cycle" || cycleAssignmentList.length === 0 || !anchorDate || !startDate) return [];
    const windowStart = new Date(`${today}T00:00:00`);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 13);
    return projectCustodySchedule(
      { cycleLengthDays, cycleAssignments: cycleAssignmentList, anchorDate, startDate, endDate: endDate || null },
      new Map(),
      windowStart,
      windowEnd
    );
  }, [mode, cycleLengthDays, cycleAssignmentList, anchorDate, startDate, endDate, today]);

  const gaps = useMemo(() => {
    if (mode !== "cycle" || preview.length === 0) return [];
    const windowStart = new Date(`${today}T00:00:00`);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 13);
    return findGaps(preview, windowStart, windowEnd);
  }, [mode, preview, today]);

  async function handleSubmit() {
    if (mode === "cycle" && cycleAssignmentList.length === 0) {
      setError("Make sure every cycle day has someone assigned.");
      return;
    }
    if (mode === "weekly_segments" && segmentsGaps.length > 0) {
      setError(`Every day needs someone assigned starting at midnight. Missing: ${segmentsGaps.join(", ")}.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body =
        mode === "weekly_segments"
          ? {
              recurrence_type: "weekly_segments" as const,
              weekly_segments: segmentsDefinitions,
              handover_location: handoverLocation.trim() || null,
              start_date: startDate,
              end_date: endDate || null,
            }
          : {
              recurrence_type: "cycle" as const,
              cycle_length_days: cycleLengthDays,
              cycle_assignments: cycleAssignmentList,
              anchor_date: anchorDate,
              handover_time: handoverTime,
              custom_handover_times: Object.keys(customHandoverOverrides).length > 0 ? customHandoverOverrides : null,
              handover_location: handoverLocation.trim() || null,
              start_date: startDate,
              end_date: endDate || null,
            };
      const res = await fetch(`/api/calendar/custody/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't save this schedule.");
        setPending(false);
        return;
      }
      router.push(`/calendar/custody/${scheduleId}`);
      router.refresh();
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "cycle" ? "default" : "outline"} onClick={() => setMode("cycle")}>
          Rolling cycle
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "weekly_segments" ? "default" : "outline"}
          onClick={() => setMode("weekly_segments")}
        >
          Day-of-week & handoffs
        </Button>
      </div>

      {mode === "weekly_segments" && (
        <div className="flex flex-col gap-2">
          <Label>Who has the kids, by day and handoff time</Label>
          <p className="text-xs text-muted-foreground">
            Every day starts with an &ldquo;all day&rdquo; assignment at midnight; add another handoff time within the same day if
            responsibility changes partway through (like a Friday evening pickup or a Monday morning return).
          </p>
          <WeeklySegmentsEditor value={segmentsState} onChange={setSegmentsState} responsibleCandidates={responsibleCandidates} />
        </div>
      )}

      {mode === "cycle" && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cycleLengthDays">Cycle length (days)</Label>
            <Input
              id="cycleLengthDays"
              type="number"
              min={1}
              max={90}
              value={cycleLengthDays}
              onChange={(e) => setCycleLengthDays(Number(e.target.value) || 1)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Who has the kids each cycle day</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: cycleLengthDays }).map((_, dayIndex) => (
                <div key={dayIndex} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-muted-foreground">Day {dayIndex + 1}</span>
                  <select
                    className={`${selectClass} flex-1`}
                    value={cycleAssignments[dayIndex] ?? ""}
                    onChange={(e) => setCycleAssignments((prev) => ({ ...prev, [dayIndex]: e.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {responsibleCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nickname || p.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="anchorDate">Cycle anchor date</Label>
            <Input id="anchorDate" type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">The date that counts as day 1 of the cycle.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="handoverTime">Default handover time</Label>
            <Input id="handoverTime" type="time" value={handoverTime} onChange={(e) => setHandoverTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Per-day handover time overrides (optional)</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: cycleLengthDays }).map((_, dayIndex) => (
                <div key={dayIndex} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-muted-foreground">Day {dayIndex + 1}</span>
                  <Input
                    type="time"
                    className="flex-1"
                    value={customHandoverOverrides[String(dayIndex)] ?? ""}
                    onChange={(e) =>
                      setCustomHandoverOverrides((prev) => {
                        const next = { ...prev };
                        if (e.target.value) next[String(dayIndex)] = e.target.value;
                        else delete next[String(dayIndex)];
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">Schedule starts</Label>
          <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">Schedule ends (optional)</Label>
          <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="handoverLocation">Handover location (optional)</Label>
        <Input
          id="handoverLocation"
          placeholder="e.g. School pickup"
          value={handoverLocation}
          onChange={(e) => setHandoverLocation(e.target.value)}
        />
      </div>

      {mode === "weekly_segments" && segmentsDefinitions.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm font-medium">Pattern summary</p>
            <p className="text-xs text-muted-foreground">{segmentsSummary}</p>
            {segmentsGaps.length > 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                No one assigned starting midnight on: {segmentsGaps.join(", ")}. Pick someone for each day above.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "cycle" && preview.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm font-medium">Next 14 days</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-3">
              {preview.map((day) => (
                <div key={day.date}>
                  {format(new Date(`${day.date}T00:00:00`), "EEE MMM d")}: {peopleById.get(day.responsiblePersonId) ?? "?"}
                </div>
              ))}
            </div>
            {Object.keys(customHandoverOverrides).length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Handover times:{" "}
                {Object.entries(customHandoverOverrides)
                  .map(([dayIndex, time]) => `${WEEKDAY_LABELS[Number(dayIndex) % 7].slice(0, 3)} ${formatHandoverTime(time)}`)
                  .join(", ")}
                , all other days {formatHandoverTime(handoverTime)}
              </p>
            )}
            {gaps.length > 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                {gaps.length === 1 ? "1 day has" : `${gaps.length} stretches have`} no one assigned — check the cycle above.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSubmit} disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
