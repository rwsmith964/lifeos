"use client";

// Shared day-of-week + handoff-time editor for the 'weekly_segments'
// recurrence type — used by both the create form (new-schedule-form.tsx)
// and the edit form (edit-schedule-form.tsx) so the two never drift. See
// lib/custody/schedule.ts (projectWeeklySegmentSchedule) for the engine
// this feeds and DECISIONS.md D-125.
//
// UI model: every day of the week always has an explicit breakpoint at
// 00:00 (who has the kids "all day" starting from midnight), plus
// optional additional same-day breakpoints for a handoff later that day
// (e.g. Friday 4:30 PM). This keeps every day unambiguous — no relying
// on the engine's "carries the last breakpoint forward" fallback — and
// means the edit form can always round-trip existing data without
// guessing what an omitted day means.
import type { PersonRow } from "@/lib/db/database.types";
import type { CustodyWeeklySegmentDefinition } from "@/lib/custody/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface DayBreakpoint {
  time: string; // "HH:MM", 24-hour
  personId: string; // "" = unassigned
}

export type WeeklySegmentsState = Record<number, DayBreakpoint[]>;

export const WEEKLY_SEGMENTS_DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const selectClass = "border-input h-9 rounded-md border bg-transparent px-3 text-sm";

export function emptyWeeklySegmentsState(): WeeklySegmentsState {
  const state: WeeklySegmentsState = {};
  for (let d = 0; d < 7; d++) state[d] = [{ time: "00:00", personId: "" }];
  return state;
}

/** Pre-fills the editor from an existing schedule's saved segments. Any day missing an explicit 00:00 breakpoint gets one added as "Unassigned" so the user notices and fills it in, rather than silently inheriting the engine's circular carry-forward behavior. */
export function weeklySegmentDefinitionsToState(segments: CustodyWeeklySegmentDefinition[]): WeeklySegmentsState {
  const state: WeeklySegmentsState = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const seg of segments) {
    state[seg.dayOfWeek] = [...state[seg.dayOfWeek], { time: seg.time, personId: seg.responsiblePersonId }];
  }
  for (let d = 0; d < 7; d++) {
    state[d].sort((a, b) => a.time.localeCompare(b.time));
    if (state[d].length === 0 || state[d][0].time !== "00:00") {
      state[d] = [{ time: "00:00", personId: "" }, ...state[d]];
    }
  }
  return state;
}

export function weeklySegmentsStateToDefinitions(state: WeeklySegmentsState): CustodyWeeklySegmentDefinition[] {
  const result: CustodyWeeklySegmentDefinition[] = [];
  for (let d = 0; d < 7; d++) {
    for (const bp of state[d] ?? []) {
      if (bp.personId) result.push({ dayOfWeek: d, time: bp.time, responsiblePersonId: bp.personId });
    }
  }
  return result;
}

/** Every day's midnight breakpoint (index 0) must have someone assigned — that's what guarantees full week coverage the same way the cycle model's gap detection does, just enforced at input time instead of after the fact. Returns a list of weekday labels missing an assignment, empty when the pattern is complete. */
export function findWeeklySegmentsGaps(state: WeeklySegmentsState): string[] {
  const gaps: string[] = [];
  for (let d = 0; d < 7; d++) {
    if (!state[d]?.[0]?.personId) gaps.push(WEEKLY_SEGMENTS_DAY_LABELS[d]);
  }
  return gaps;
}

export function WeeklySegmentsEditor({
  value,
  onChange,
  responsibleCandidates,
}: {
  value: WeeklySegmentsState;
  onChange: (next: WeeklySegmentsState) => void;
  responsibleCandidates: PersonRow[];
}) {
  function updateBreakpoint(day: number, index: number, patch: Partial<DayBreakpoint>) {
    const dayRows = value[day] ?? [];
    const nextRows = dayRows.map((bp, i) => (i === index ? { ...bp, ...patch } : bp));
    onChange({ ...value, [day]: nextRows });
  }

  function addBreakpoint(day: number) {
    const dayRows = value[day] ?? [];
    onChange({ ...value, [day]: [...dayRows, { time: "12:00", personId: "" }] });
  }

  function removeBreakpoint(day: number, index: number) {
    const dayRows = value[day] ?? [];
    onChange({ ...value, [day]: dayRows.filter((_, i) => i !== index) });
  }

  return (
    <div className="flex flex-col gap-2">
      {WEEKLY_SEGMENTS_DAY_LABELS.map((label, day) => {
        const rows = value[day] ?? [{ time: "00:00", personId: "" }];
        return (
          <div key={day} className="flex flex-col gap-2 rounded-md border border-input p-2">
            <span className="text-sm font-medium">{label}</span>
            {rows.map((bp, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                {index === 0 ? (
                  <span className="w-32 shrink-0 text-xs text-muted-foreground">All day from 12:00 AM</span>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Then at</span>
                    <Input
                      type="time"
                      className="w-32"
                      value={bp.time}
                      onChange={(e) => updateBreakpoint(day, index, { time: e.target.value })}
                    />
                  </div>
                )}
                <select
                  className={`${selectClass} min-w-32 flex-1`}
                  value={bp.personId}
                  onChange={(e) => updateBreakpoint(day, index, { personId: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {responsibleCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname || p.full_name}
                    </option>
                  ))}
                </select>
                {index > 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeBreakpoint(day, index)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => addBreakpoint(day)}>
              + Add another handoff this day
            </Button>
          </div>
        );
      })}
    </div>
  );
}
