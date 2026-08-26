"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { PersonRow } from "@/lib/db/database.types";
import {
  buildPresetCycle,
  CUSTODY_PRESET_LABELS,
  findGaps,
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

export function NewScheduleForm({
  childPeople,
  responsibleCandidates,
}: {
  childPeople: PersonRow[];
  responsibleCandidates: PersonRow[];
}) {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");

  const [childPersonId, setChildPersonId] = useState(childPeople[0]?.id ?? "");
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [preset, setPreset] = useState<CustodyPresetName>("week_on_week_off");
  const [primaryPersonId, setPrimaryPersonId] = useState(responsibleCandidates[0]?.id ?? "");
  const [secondaryPersonId, setSecondaryPersonId] = useState(responsibleCandidates[1]?.id ?? responsibleCandidates[0]?.id ?? "");
  const [customCycleLength, setCustomCycleLength] = useState(7);
  const [customAssignments, setCustomAssignments] = useState<Record<number, string>>({});
  const [anchorDate, setAnchorDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [handoverTime, setHandoverTime] = useState("17:00");
  const [handoverLocation, setHandoverLocation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { cycleLengthDays, cycleAssignments } = useMemo<{
    cycleLengthDays: number;
    cycleAssignments: CustodyCycleAssignment[];
  }>(() => {
    if (mode === "preset") {
      if (!primaryPersonId || !secondaryPersonId) return { cycleLengthDays: 0, cycleAssignments: [] };
      return buildPresetCycle(preset, primaryPersonId, secondaryPersonId);
    }
    const assignments: CustodyCycleAssignment[] = Object.entries(customAssignments)
      .filter(([, personId]) => personId)
      .map(([dayIndex, responsiblePersonId]) => ({ dayIndex: Number(dayIndex), responsiblePersonId }));
    return { cycleLengthDays: customCycleLength, cycleAssignments: assignments };
  }, [mode, preset, primaryPersonId, secondaryPersonId, customCycleLength, customAssignments]);

  const peopleById = useMemo(() => new Map(responsibleCandidates.map((p) => [p.id, p.nickname || p.full_name])), [responsibleCandidates]);

  const preview = useMemo(() => {
    if (cycleLengthDays === 0 || cycleAssignments.length === 0 || !anchorDate || !startDate) return [];
    const windowStart = new Date(`${today}T00:00:00`);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 13);
    return projectCustodySchedule(
      { cycleLengthDays, cycleAssignments, anchorDate, startDate, endDate: endDate || null },
      new Map(),
      windowStart,
      windowEnd
    );
  }, [cycleLengthDays, cycleAssignments, anchorDate, startDate, endDate, today]);

  const gaps = useMemo(() => {
    if (preview.length === 0 || cycleLengthDays === 0) return [];
    const windowStart = new Date(`${today}T00:00:00`);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 13);
    return findGaps(preview, windowStart, windowEnd);
  }, [preview, cycleLengthDays, today]);

  async function handleSubmit() {
    if (!childPersonId || cycleAssignments.length === 0) {
      setError("Pick a child and make sure every cycle day has someone assigned.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/custody/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_person_id: childPersonId,
          cycle_length_days: cycleLengthDays,
          cycle_assignments: cycleAssignments,
          anchor_date: anchorDate,
          handover_time: handoverTime,
          handover_location: handoverLocation.trim() || null,
          start_date: startDate,
          end_date: endDate || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't save this schedule.");
        setPending(false);
        return;
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
        <Label htmlFor="childPersonId">Child</Label>
        <select id="childPersonId" className={selectClass} value={childPersonId} onChange={(e) => setChildPersonId(e.target.value)}>
          {childPeople.map((child) => (
            <option key={child.id} value={child.id}>
              {child.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "preset" ? "default" : "outline"} onClick={() => setMode("preset")}>
          Common pattern
        </Button>
        <Button type="button" size="sm" variant={mode === "custom" ? "default" : "outline"} onClick={() => setMode("custom")}>
          Custom cycle
        </Button>
      </div>

      {mode === "preset" ? (
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
        </>
      ) : (
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
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="anchorDate">Cycle anchor date</Label>
          <Input id="anchorDate" type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          <p className="text-xs text-muted-foreground">The date that counts as day 1 of the cycle.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">Schedule starts</Label>
          <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">Schedule ends (optional)</Label>
          <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="handoverTime">Handover time</Label>
          <Input id="handoverTime" type="time" value={handoverTime} onChange={(e) => setHandoverTime(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="handoverLocation">Handover location (optional)</Label>
        <Input id="handoverLocation" placeholder="e.g. School pickup" value={handoverLocation} onChange={(e) => setHandoverLocation(e.target.value)} />
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
            {gaps.length > 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                {gaps.length === 1 ? "1 day has" : `${gaps.length} stretches have`} no one assigned — check the cycle
                above.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSubmit} disabled={pending}>
        {pending ? "Saving…" : "Create schedule"}
      </Button>
    </div>
  );
}
