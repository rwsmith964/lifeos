"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { PersonRow } from "@/lib/db/database.types";
import {
  buildPresetCycle,
  CUSTODY_PRESET_LABELS,
  findGaps,
  formatHandoverTime,
  projectCustodySchedule,
  type CustodyCycleAssignment,
  type CustodyPresetName,
} from "@/lib/custody/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const PRESET_NAMES = Object.keys(CUSTODY_PRESET_LABELS) as CustodyPresetName[];
const selectClass = "border-input h-9 rounded-md border bg-transparent px-3 text-sm";
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Most recent Sunday on/before dateStr, so the Weekly builder can auto-derive a cycle anchor and let the user think purely in weekday names, never abstract cycle day-indices. */
function mostRecentSunday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return format(d, "yyyy-MM-dd");
}

type Mode = "preset" | "weekly" | "advanced";

export function NewScheduleForm({
  childPeople,
  responsibleCandidates,
}: {
  childPeople: PersonRow[];
  responsibleCandidates: PersonRow[];
}) {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");

  // Multi-child selection: the same schedule pattern is created once per
  // selected child (a loop of otherwise-identical POSTs), so the "build one
  // child's calendar at a time" flow still works but two kids who share the
  // exact same custody arrangement no longer require doing this twice.
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(childPeople[0] ? [childPeople[0].id] : []);
  const [mode, setMode] = useState<Mode>("preset");

  // Common pattern mode state
  const [preset, setPreset] = useState<CustodyPresetName>("week_on_week_off");
  const [primaryPersonId, setPrimaryPersonId] = useState(responsibleCandidates[0]?.id ?? "");
  const [secondaryPersonId, setSecondaryPersonId] = useState(responsibleCandidates[1]?.id ?? responsibleCandidates[0]?.id ?? "");
  const [anchorDate, setAnchorDate] = useState(today);

  // Advanced (custom cycle) mode state
  const [customCycleLength, setCustomCycleLength] = useState(7);
  const [customAssignments, setCustomAssignments] = useState<Record<number, string>>({});

  // Weekly (day-by-day) mode state — one row per weekday (0=Sun..6=Sat).
  // "All Day" checked (default) means this day has no handover-time
  // override and just uses the schedule's single default handover time
  // below; unchecked reveals a time input that becomes this day's entry in
  // custom_handover_times. This is the direct fix for "pick up Friday
  // 4:30pm, return Monday 8:30am" being two different times that the old
  // single-handover_time model couldn't express (see D-074).
  const [weeklyAssignments, setWeeklyAssignments] = useState<Record<number, string>>({});
  const [weeklyAllDay, setWeeklyAllDay] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
  const [weeklyHandoverTime, setWeeklyHandoverTime] = useState<Record<number, string>>({});

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [handoverTime, setHandoverTime] = useState("17:00");
  const [handoverLocation, setHandoverLocation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weeklyAnchorDate = useMemo(() => mostRecentSunday(startDate), [startDate]);

  const { cycleLengthDays, cycleAssignments, effectiveAnchorDate, customHandoverTimes } = useMemo<{
    cycleLengthDays: number;
    cycleAssignments: CustodyCycleAssignment[];
    effectiveAnchorDate: string;
    customHandoverTimes: Record<string, string> | null;
  }>(() => {
    if (mode === "preset") {
      if (!primaryPersonId || !secondaryPersonId) {
        return { cycleLengthDays: 0, cycleAssignments: [], effectiveAnchorDate: anchorDate, customHandoverTimes: null };
      }
      return { ...buildPresetCycle(preset, primaryPersonId, secondaryPersonId), effectiveAnchorDate: anchorDate, customHandoverTimes: null };
    }
    if (mode === "weekly") {
      const assignments: CustodyCycleAssignment[] = Object.entries(weeklyAssignments)
        .filter(([, personId]) => personId)
        .map(([dayIndex, responsiblePersonId]) => ({ dayIndex: Number(dayIndex), responsiblePersonId }));
      const overrides: Record<string, string> = {};
      for (const [dayIndexStr, isAllDay] of Object.entries(weeklyAllDay)) {
        if (!isAllDay && weeklyHandoverTime[Number(dayIndexStr)]) {
          overrides[dayIndexStr] = weeklyHandoverTime[Number(dayIndexStr)];
        }
      }
      return {
        cycleLengthDays: 7,
        cycleAssignments: assignments,
        effectiveAnchorDate: weeklyAnchorDate,
        customHandoverTimes: Object.keys(overrides).length > 0 ? overrides : null,
      };
    }
    const assignments: CustodyCycleAssignment[] = Object.entries(customAssignments)
      .filter(([, personId]) => personId)
      .map(([dayIndex, responsiblePersonId]) => ({ dayIndex: Number(dayIndex), responsiblePersonId }));
    return { cycleLengthDays: customCycleLength, cycleAssignments: assignments, effectiveAnchorDate: anchorDate, customHandoverTimes: null };
  }, [mode, preset, primaryPersonId, secondaryPersonId, customCycleLength, customAssignments, anchorDate, weeklyAssignments, weeklyAllDay, weeklyHandoverTime, weeklyAnchorDate]);

  const peopleById = useMemo(() => new Map(responsibleCandidates.map((p) => [p.id, p.nickname || p.full_name])), [responsibleCandidates]);

  const preview = useMemo(() => {
    if (cycleLengthDays === 0 || cycleAssignments.length === 0 || !effectiveAnchorDate || !startDate) return [];
    const windowStart = new Date(`${today}T00:00:00`);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 13);
    return projectCustodySchedule(
      { cycleLengthDays, cycleAssignments, anchorDate: effectiveAnchorDate, startDate, endDate: endDate || null },
      new Map(),
      windowStart,
      windowEnd
    );
  }, [cycleLengthDays, cycleAssignments, effectiveAnchorDate, startDate, endDate, today]);

  const gaps = useMemo(() => {
    if (preview.length === 0 || cycleLengthDays === 0) return [];
    const windowStart = new Date(`${today}T00:00:00`);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 13);
    return findGaps(preview, windowStart, windowEnd);
  }, [preview, cycleLengthDays, today]);

  function toggleChild(id: string) {
    setSelectedChildIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (selectedChildIds.length === 0 || cycleAssignments.length === 0) {
      setError("Pick at least one child and make sure every day has someone assigned.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      for (const childPersonId of selectedChildIds) {
        const res = await fetch("/api/calendar/custody/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            child_person_id: childPersonId,
            cycle_length_days: cycleLengthDays,
            cycle_assignments: cycleAssignments,
            anchor_date: effectiveAnchorDate,
            handover_time: handoverTime,
            custom_handover_times: customHandoverTimes,
            handover_location: handoverLocation.trim() || null,
            start_date: startDate,
            end_date: endDate || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const childName = childPeople.find((c) => c.id === childPersonId)?.full_name ?? "one of the selected children";
          setError(
            `Couldn't save the schedule for ${childName}${typeof data.error === "string" ? `: ${data.error}` : "."} ${selectedChildIds.length > 1 ? "Schedules already saved for other children before this failure were not undone." : ""}`.trim()
          );
          setPending(false);
          return;
        }
      }
      router.push("/calendar/custody");
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Child{selectedChildIds.length > 1 ? "ren" : ""}</Label>
        <p className="text-xs text-muted-foreground">Select every child this arrangement applies to — the same pattern is created for each.</p>
        <div className="flex flex-wrap gap-2">
          {childPeople.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => toggleChild(child.id)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                selectedChildIds.includes(child.id) ? "border-primary bg-primary/10 font-medium" : "border-input"
              }`}
            >
              {child.full_name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "preset" ? "default" : "outline"} onClick={() => setMode("preset")}>
          Common pattern
        </Button>
        <Button type="button" size="sm" variant={mode === "weekly" ? "default" : "outline"} onClick={() => setMode("weekly")}>
          Weekly (day-by-day)
        </Button>
        <Button type="button" size="sm" variant={mode === "advanced" ? "default" : "outline"} onClick={() => setMode("advanced")}>
          Advanced
        </Button>
      </div>

      {mode === "preset" && (
        <>
          <div className="flex flex-col gap-2">
            <Label>Pattern</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_NAMES.map((name) => (
                <Button key={name} type="button" size="sm" variant={preset === name ? "default" : "outline"} onClick={() => setPreset(name)}>
                  {CUSTODY_PRESET_LABELS[name]}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="primaryPersonId">Primary parent</Label>
              <select id="primaryPersonId" className={selectClass} value={primaryPersonId} onChange={(e) => setPrimaryPersonId(e.target.value)}>
                {responsibleCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="secondaryPersonId">Other parent</Label>
              <select id="secondaryPersonId" className={selectClass} value={secondaryPersonId} onChange={(e) => setSecondaryPersonId(e.target.value)}>
                {responsibleCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="anchorDate">Cycle anchor date</Label>
            <Input id="anchorDate" type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">The date that counts as day 1 of the cycle.</p>
          </div>
        </>
      )}

      {mode === "weekly" && (
        <div className="flex flex-col gap-2">
          <Label>Who has the kids each day</Label>
          <p className="text-xs text-muted-foreground">
            For each day, pick who&rsquo;s responsible starting that day. Leave &ldquo;All Day&rdquo; checked to use the default handover time below, or
            uncheck it to set a different time for that day &mdash; e.g. Friday at 4:30 PM and Monday at 8:30 AM for a &ldquo;every other weekend&rdquo;
            arrangement.
          </p>
          <div className="flex flex-col gap-2">
            {WEEKDAY_LABELS.map((label, dayIndex) => {
              const isAllDay = weeklyAllDay[dayIndex] ?? true;
              return (
                <div key={dayIndex} className="flex flex-wrap items-center gap-2 rounded-md border border-input p-2">
                  <span className="w-24 text-sm font-medium">{label}</span>
                  <select
                    className={`${selectClass} flex-1 min-w-32`}
                    value={weeklyAssignments[dayIndex] ?? ""}
                    onChange={(e) => setWeeklyAssignments((prev) => ({ ...prev, [dayIndex]: e.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {responsibleCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nickname || p.full_name}
                      </option>
                    ))}
                  </select>
                  <label className="flex w-20 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={isAllDay}
                      onChange={(e) => setWeeklyAllDay((prev) => ({ ...prev, [dayIndex]: e.target.checked }))}
                    />
                    All Day
                  </label>
                  {/* Always reserve this row's width, even when "All Day" is checked, so
                      toggling a row never reflows the rows below it — an earlier version
                      showed/hid this field, which shifted every subsequent checkbox and
                      caused accidental misclicks on the wrong day while toggling quickly. */}
                  <Input
                    type="time"
                    className="w-32"
                    disabled={isAllDay}
                    value={weeklyHandoverTime[dayIndex] ?? ""}
                    onChange={(e) => setWeeklyHandoverTime((prev) => ({ ...prev, [dayIndex]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Cycle anchor is automatically set to {format(new Date(`${weeklyAnchorDate}T00:00:00`), "MMM d, yyyy")} (the Sunday on or before the start date)
            so this repeats every week.
          </p>
        </div>
      )}

      {mode === "advanced" && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="customCycleLength">Cycle length (days)</Label>
            <Input
              id="customCycleLength"
              type="number"
              min={1}
              max={90}
              value={customCycleLength}
              onChange={(e) => setCustomCycleLength(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Assign each day of the cycle</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: customCycleLength }, (_, dayIndex) => (
                <div key={dayIndex} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-muted-foreground">Day {dayIndex + 1}</span>
                  <select
                    className={`${selectClass} flex-1`}
                    value={customAssignments[dayIndex] ?? ""}
                    onChange={(e) => setCustomAssignments((prev) => ({ ...prev, [dayIndex]: e.target.value }))}
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
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="handoverTime">{mode === "weekly" ? "Default handover time (All Day days)" : "Handover time"}</Label>
          <Input id="handoverTime" type="time" value={handoverTime} onChange={(e) => setHandoverTime(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="handoverLocation">Handover location (optional)</Label>
          <Input id="handoverLocation" placeholder="e.g. School pickup" value={handoverLocation} onChange={(e) => setHandoverLocation(e.target.value)} />
        </div>
      </div>

      {preview.length > 0 && (
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
            {customHandoverTimes && (
              <p className="mt-1 text-xs text-muted-foreground">
                Handover times: {Object.entries(customHandoverTimes)
                  .map(([dayIndex, time]) => `${WEEKDAY_LABELS[Number(dayIndex)].slice(0, 3)} ${formatHandoverTime(time)}`)
                  .join(", ")}
                {Object.keys(customHandoverTimes).length < 7 && `, all other days ${formatHandoverTime(handoverTime)}`}
              </p>
            )}
            {gaps.length > 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                {gaps.length === 1 ? "1 day has" : `${gaps.length} stretches have`} no one assigned — check the {mode === "weekly" ? "days" : "cycle"}{" "}
                above.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSubmit} disabled={pending}>
        {pending ? "Saving…" : selectedChildIds.length > 1 ? `Create schedule for ${selectedChildIds.length} children` : "Create schedule"}
      </Button>
    </div>
  );
}
