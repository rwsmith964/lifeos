// "Find a time for Rusty and me to go fishing": which stretches of which days
// are free for everyone involved, ranked, with a note on whose kids are around.
// Pure. Times are floating wall-clock values (see lib/custody/materialize.ts),
// so "9am" here means 9am on the clock wherever the people are.
import { addDays, addMinutes, startOfDay } from "date-fns";

export interface Interval {
  start: Date;
  end: Date;
}

export interface FindTimeInput {
  rangeStart: Date;
  rangeEnd: Date;
  /** One list of busy intervals per person who needs to be free. */
  busy: Interval[][];
  minMinutes: number;
  /** Earliest and latest clock hour a window may use (e.g. 7 and 20). */
  dayStartHour: number;
  dayEndHour: number;
}

export interface FreeWindow extends Interval {
  minutes: number;
  weekend: boolean;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      merged.push({ start: iv.start, end: iv.end });
    }
  }
  return merged;
}

/** Every stretch of at least minMinutes, within each day's hours, when nobody is busy. */
export function freeWindows(input: FindTimeInput): FreeWindow[] {
  const all = mergeIntervals(input.busy.flat());
  const out: FreeWindow[] = [];

  for (let day = startOfDay(input.rangeStart); day <= input.rangeEnd; day = addDays(day, 1)) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), input.dayStartHour, 0);
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), input.dayEndHour, 0);
    let cursor = dayStart < input.rangeStart ? input.rangeStart : dayStart;
    const limit = dayEnd > input.rangeEnd ? input.rangeEnd : dayEnd;

    const todays = all.filter((iv) => iv.end > cursor && iv.start < limit);
    const weekend = [0, 6].includes(day.getDay());

    const push = (start: Date, end: Date) => {
      const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
      if (minutes >= input.minMinutes) out.push({ start, end, minutes, weekend });
    };

    for (const iv of todays) {
      if (iv.start > cursor) push(cursor, iv.start < limit ? iv.start : limit);
      if (iv.end > cursor) cursor = iv.end;
    }
    if (cursor < limit) push(cursor, limit);
  }
  return out;
}

/** Weekends first, then longer windows, then earlier; at most two windows per day. */
export function rankWindows(windows: FreeWindow[], limit: number): FreeWindow[] {
  const sorted = [...windows].sort((a, b) => {
    if (a.weekend !== b.weekend) return a.weekend ? -1 : 1;
    if (a.minutes !== b.minutes) return b.minutes - a.minutes;
    return a.start.getTime() - b.start.getTime();
  });
  const perDay = new Map<string, number>();
  const picked: FreeWindow[] = [];
  for (const w of sorted) {
    const key = startOfDay(w.start).toISOString();
    const count = perDay.get(key) ?? 0;
    if (count >= 2) continue;
    perDay.set(key, count + 1);
    picked.push(w);
    if (picked.length >= limit) break;
  }
  // Show chronologically, the way a person reads a list of options.
  return picked.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Trim a long free window down to what's actually needed, starting at a sensible hour. */
export function fitActivity(window: FreeWindow, durationMinutes: number): Interval {
  const minutes = Math.min(durationMinutes, window.minutes);
  return { start: window.start, end: addMinutes(window.start, minutes) };
}

export function overlapsAny(iv: Interval, others: Interval[]): boolean {
  return others.some((o) => o.start < iv.end && o.end > iv.start);
}

export interface FindTimeIntent {
  /** The other person's name as typed ("Rusty"). */
  withName: string;
  /** What they want to do ("go fishing"), without the leading "go". */
  activity: string;
}

/**
 * Pulls "find a time for Rusty and I to go fishing" apart. Deliberately narrow:
 * it only fires on clear phrasings, so ordinary notes aren't hijacked.
 */
export function parseFindTimeIntent(text: string): FindTimeIntent | null {
  const t = text.trim().replace(/\s+/g, " ");
  const patterns = [
    /\b(?:find|pick|suggest|schedule)\s+(?:me\s+)?(?:a\s+)?(?:time|day|date|weekend)\s+(?:for|with)\s+(.+?)\s+(?:and\s+(?:I|me)|&\s*(?:I|me))\s+to\s+(.+)$/i,
    /\b(?:find|pick|suggest|schedule)\s+(?:a\s+)?(?:time|day|date|weekend)\s+(?:for\s+me\s+and|for\s+(?:me|us)\s+(?:and|with))\s+(.+?)\s+to\s+(.+)$/i,
    /\bwhen\s+(?:can|could)\s+(?:I|me)\s+and\s+(.+?)\s+(.+)$/i,
    /\b(?:when|what\s+time)\s+(?:can|could)\s+(?:I|we)\s+(.+?)\s+and\s+(?:I|me)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(t);
    if (!match) continue;
    const withName = match[1].replace(/^(?:with|my)\s+/i, "").trim();
    const activity = match[2].replace(/[?.!]+$/, "").replace(/^go\s+/i, "").trim();
    if (withName && activity && withName.split(" ").length <= 3) return { withName, activity };
  }
  return null;
}
