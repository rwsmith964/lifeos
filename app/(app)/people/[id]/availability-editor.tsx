"use client";

// Recurring availability for one person. For an adult it answers "when are
// they busy" (a girlfriend's kids' weeks -- no need to enter her kids at
// all); for a child it is their school schedule. Both are the same pattern:
// every week or alternating weeks, which weekdays, optional times, optional
// dates it doesn't apply (school breaks, a week she is free).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { useToast } from "@/components/ui/toast";
import { addAvailabilityScheduleAction, deleteAvailabilityScheduleAction } from "./availability-actions";
import { WEEKDAY_SHORT, anchorMondayOf, buildPattern, describePattern } from "@/lib/availability/pattern";
import type { AvailabilityKind, AvailabilityScheduleRow } from "@/lib/db/database.types";

const EMPTY_WEEK = [false, false, false, false, false, false, false];

interface SkipDraft {
  start: string;
  end: string;
  label: string;
}

export function AvailabilityList({ personId, schedules }: { personId: string; schedules: AvailabilityScheduleRow[] }) {
  if (schedules.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {schedules.map((schedule) => (
        <div key={schedule.id} className="flex items-start justify-between gap-2 text-sm">
          <div>
            <p className="font-medium">{schedule.label || (schedule.kind === "school" ? "School" : "Busy")}</p>
            <p className="text-xs text-muted-foreground">
              {describePattern(schedule.cycle_length_days, schedule.pattern)}
              {schedule.skip_ranges.length > 0 && ` · ${schedule.skip_ranges.length} break${schedule.skip_ranges.length === 1 ? "" : "s"} excluded`}
            </p>
          </div>
          <ConfirmDeleteButton
            variant="icon"
            ariaLabel="Remove schedule"
            action={() => deleteAvailabilityScheduleAction(personId, schedule.id)}
            successMessage="Schedule removed."
          />
        </div>
      ))}
    </div>
  );
}

export function AvailabilityForm({
  personId,
  personName,
  kind,
  today,
}: {
  personId: string;
  personName: string;
  kind: AvailabilityKind;
  /** yyyy-MM-dd, household-local today. */
  today: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const isSchool = kind === "school";

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(isSchool ? "School" : "Kids' weeks");
  const [alternating, setAlternating] = useState(!isSchool);
  const [weekA, setWeekA] = useState<boolean[]>(isSchool ? [true, true, true, true, true, false, false] : [...EMPTY_WEEK]);
  const [weekB, setWeekB] = useState<boolean[]>([...EMPTY_WEEK]);
  const [weekAStartsOn, setWeekAStartsOn] = useState(anchorMondayOf(today));
  const [allDay, setAllDay] = useState(!isSchool);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("15:00");
  const [endDate, setEndDate] = useState("");
  const [skips, setSkips] = useState<SkipDraft[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLabel = isSchool ? "Add school schedule" : `Add when ${personName} is busy`;

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    );
  }

  function toggle(week: boolean[], setWeek: (w: boolean[]) => void, index: number) {
    setWeek(week.map((v, i) => (i === index ? !v : v)));
  }

  async function handleSave() {
    setError(null);
    const weeks = alternating ? [weekA, weekB] : [weekA];
    const pattern = buildPattern(weeks, {
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime,
    });
    if (pattern.length === 0) {
      setError("Pick at least one day.");
      return;
    }
    const anchor = anchorMondayOf(weekAStartsOn || today);
    setPending(true);
    const result = await addAvailabilityScheduleAction(personId, {
      kind,
      label: label.trim(),
      cycle_length_days: alternating ? 14 : 7,
      pattern,
      anchor_date: anchor,
      start_date: anchor,
      end_date: endDate || null,
      skip_ranges: skips
        .filter((s) => s.start && s.end)
        .map((s) => ({ start: s.start, end: s.end, label: s.label.trim() || undefined })),
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    showToast({ title: "Schedule saved.", variant: "success" });
    setOpen(false);
    router.refresh();
  }

  const weekRow = (name: string, week: boolean[], setWeek: (w: boolean[]) => void) => (
    <div className="flex flex-col gap-1">
      {alternating && <span className="text-xs text-muted-foreground">{name}</span>}
      <div className="flex flex-wrap gap-1">
        {WEEKDAY_SHORT.map((day, index) => (
          <button
            key={day}
            type="button"
            aria-pressed={week[index]}
            onClick={() => toggle(week, setWeek, index)}
            className={`h-control-touch min-w-11 rounded-md border px-2 text-sm md:h-8 ${
              week[index] ? "border-action bg-action-soft-bg text-ink" : "border-line text-ink-2"
            }`}
          >
            {day}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{addLabel}</span>
        <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`avail-label-${kind}`}>Name</Label>
        <Input id={`avail-label-${kind}`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
      </div>

      <div className="flex flex-col gap-1">
        <Label>How often</Label>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input type="radio" name={`cycle-${kind}`} checked={!alternating} onChange={() => setAlternating(false)} /> Every week
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name={`cycle-${kind}`} checked={alternating} onChange={() => setAlternating(true)} /> Alternating weeks
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{isSchool ? "School days" : `Days ${personName} is busy`}</Label>
        {weekRow("Week 1", weekA, setWeekA)}
        {alternating && weekRow("Week 2", weekB, setWeekB)}
      </div>

      {alternating && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`avail-start-${kind}`}>Week 1 is the week of</Label>
          <Input
            id={`avail-start-${kind}`}
            type="date"
            value={weekAStartsOn}
            onChange={(e) => setWeekAStartsOn(e.target.value)}
            className="w-44"
          />
          <p className="text-xs text-muted-foreground">Any day in that week works. The pattern repeats from there.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {!isSchool && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
          </label>
        )}
        {(isSchool || !allDay) && (
          <div className="flex items-center gap-2 text-sm">
            <Input aria-label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-32" />
            <span>to</span>
            <Input aria-label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-32" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{isSchool ? "Breaks (no school)" : "Weeks she's free anyway (optional)"}</Label>
        {skips.map((skip, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Input aria-label="From" type="date" value={skip.start} onChange={(e) => setSkips(skips.map((s, i) => (i === index ? { ...s, start: e.target.value } : s)))} className="w-40" />
            <span className="text-sm">to</span>
            <Input aria-label="Through" type="date" value={skip.end} onChange={(e) => setSkips(skips.map((s, i) => (i === index ? { ...s, end: e.target.value } : s)))} className="w-40" />
            <Input
              aria-label="Label"
              placeholder={isSchool ? "Winter break" : "Optional note"}
              value={skip.label}
              onChange={(e) => setSkips(skips.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)))}
              className="w-40"
            />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove range" onClick={() => setSkips(skips.filter((_, i) => i !== index))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setSkips([...skips, { start: "", end: "", label: "" }])}>
          <Plus className="size-4" /> {isSchool ? "Add a break" : "Add a free stretch"}
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`avail-end-${kind}`}>Ends on (optional)</Label>
        <Input id={`avail-end-${kind}`} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" size="sm" className="self-start" disabled={pending} onClick={handleSave}>
        {pending ? "Saving…" : "Save schedule"}
      </Button>
    </div>
  );
}
