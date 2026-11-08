// "I actually work 7am to 5pm": turning a spoken change to the repeating weekly
// work schedule into the exact row changes. Pure, so the rules are testable.
// Existing shifts on the affected days are edited in place (not duplicated);
// days named that have no shift yet get one.
export interface ExistingShift {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface ScheduleUpdateRequest {
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  /** Comma-separated weekday numbers (0 = Sunday); null/empty = every day already worked. */
  days: string | null | undefined;
}

export type ScheduleChange =
  | { kind: "update"; id: string; startTime: string; endTime: string }
  | { kind: "create"; dayOfWeek: number; startTime: string; endTime: string }
  | { kind: "delete"; id: string };

export type ScheduleUpdatePlan = { ok: true; changes: ScheduleChange[] } | { ok: false; error: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Postgres returns "07:00:00"; the column accepts "07:00". */
function toHHMM(time: string): string {
  return time.slice(0, 5);
}

export function parseWorkDays(raw: string | null | undefined): number[] | null {
  if (!raw || !raw.trim()) return null;
  const days = raw
    .split(",")
    .map((d) => Number.parseInt(d.trim(), 10))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length > 0 ? [...new Set(days)].sort() : null;
}

export function planWorkScheduleUpdate(existing: ExistingShift[], request: ScheduleUpdateRequest): ScheduleUpdatePlan {
  const start = request.startTime?.trim() ?? "";
  const end = request.endTime?.trim() ?? "";
  if (!HHMM.test(start) || !HHMM.test(end)) return { ok: false, error: "I need both the start and end time for your work day." };
  if (end <= start) return { ok: false, error: "The end of your work day has to be after the start." };

  const named = parseWorkDays(request.days);
  const existingDays = [...new Set(existing.map((s) => s.day_of_week))].sort();
  const targetDays = named ?? existingDays;
  if (targetDays.length === 0) {
    return { ok: false, error: "You don't have a repeating work schedule yet. Tell me which days you work." };
  }

  const changes: ScheduleChange[] = [];
  for (const day of targetDays) {
    const rows = existing.filter((s) => s.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
    if (rows.length === 0) {
      changes.push({ kind: "create", dayOfWeek: day, startTime: start, endTime: end });
      continue;
    }
    // One day, one shift: the first row takes the new hours, any split-shift leftovers go.
    const [first, ...rest] = rows;
    if (toHHMM(first.start_time) !== start || toHHMM(first.end_time) !== end) {
      changes.push({ kind: "update", id: first.id, startTime: start, endTime: end });
    }
    for (const extra of rest) changes.push({ kind: "delete", id: extra.id });
  }

  if (changes.length === 0) return { ok: false, error: "Your work schedule already has those hours." };
  return { ok: true, changes };
}
