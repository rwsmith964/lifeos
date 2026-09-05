// D-133: pure, DB-free layout math for the day view's hour-positioned
// timeline. Mirrors the split already used everywhere else in the
// scheduling code (lib/scheduling/travel-conflicts.ts, lib/calendar/
// month-cell.ts): async DB/API work stays in the page/repository layer,
// and the actual "where does this pixel go" math is a pure, fully
// unit-testable function here.
//
// The day view keeps the existing agenda card list untouched below this
// (per "don't refactor beyond what each fix needs") — this timeline is an
// additional visual on top, not a replacement for the working Edit/Delete
// controls.
//
// D-167: added side-by-side column layout for time-overlapping items (an
// earlier version rendered every item full-width, so two events at the
// same time silently hid one another), a "now" indicator line, and
// `buildWeekTimeline` — a 7-day variant that shares ONE hour window across
// all its days (via `layoutItemsForWindow`, factored out of
// `buildDayTimeline`) so hour rows line up across day columns the way
// Google/Apple/Outlook's week view does.

export const DEFAULT_WINDOW_START_HOUR = 7;
export const DEFAULT_WINDOW_END_HOUR = 21;

/** Minimum visual height for a very short or zero-duration event, so a
 * 15-minute appointment (or a 0-duration marker) doesn't collapse to an
 * invisible sliver. */
const MIN_HEIGHT_PERCENT = 2;

export interface DayTimelineItemLike {
  id: string;
  kind: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay?: boolean;
}

export interface DayTimelinePositionedItem {
  id: string;
  kind: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  topPercent: number;
  heightPercent: number;
  /** Zero-based column index among other items it visually overlaps. */
  column: number;
  /** Total number of side-by-side columns in this item's overlap group (>=1). */
  columnCount: number;
}

/** One resolved travel leg between two chronologically adjacent, located
 * events — same shape produced by resolveTravelLegsForHousehold /
 * detectTravelTimeConflicts, just flattened to the fields the timeline
 * needs so this module never has to import the DB-facing types. */
export interface DayTimelineTravelLeg {
  fromEventId: string;
  toEventId: string;
  minutes: number;
}

export interface DayTimelineTravelSegment {
  fromEventId: string;
  toEventId: string;
  minutes: number;
  topPercent: number;
  heightPercent: number;
}

export interface DayTimelineLayout {
  startHour: number;
  endHour: number;
  /** One label per hour line, e.g. "7 AM" .. "9 PM", for the hour-window rulers. */
  hourLabels: string[];
  positioned: DayTimelinePositionedItem[];
  allDay: DayTimelineItemLike[];
  travelSegments: DayTimelineTravelSegment[];
  /** Top-percent position of "now" within the window, or null when `now`
   * wasn't supplied, falls on a different calendar day than `day`, or
   * falls outside the rendered hour window. */
  nowPercent: number | null;
}

function hourOfDay(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function startOfDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
}

function endOfDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const period = normalized < 12 ? "AM" : "PM";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display} ${period}`;
}

/**
 * Default hour window is 7 AM-9 PM. Any timed item that starts before or
 * ends after that gets the window expanded to fit it, with one hour of
 * padding on the outlier side, clamped to a full 0-24 day. Only timed
 * (non-all-day) items are considered — an all-day item never needs the
 * window to expand around it since it renders in its own strip.
 */
export function computeTimelineWindow(timedItems: { startsAt: Date; endsAt: Date }[]): {
  startHour: number;
  endHour: number;
} {
  let startHour = DEFAULT_WINDOW_START_HOUR;
  let endHour = DEFAULT_WINDOW_END_HOUR;

  for (const item of timedItems) {
    const s = hourOfDay(item.startsAt);
    const e = Math.max(hourOfDay(item.endsAt), s);
    if (s < startHour) startHour = Math.max(0, Math.floor(s) - 1);
    if (e > endHour) endHour = Math.min(24, Math.ceil(e) + 1);
  }

  if (endHour <= startHour) endHour = Math.min(24, startHour + 1);
  return { startHour, endHour };
}

/**
 * Assigns each item a `{column, columnCount}` pair so time-overlapping
 * items render side-by-side instead of one hiding another. Overlap is
 * judged on the already-clipped `[topPercent, topPercent+heightPercent)`
 * ranges (not the raw start/end instants), so two zero-duration items at
 * the exact same time — which both get bumped up to MIN_HEIGHT_PERCENT —
 * are correctly treated as overlapping and split into separate columns.
 *
 * Algorithm: union-find groups items into overlap clusters, then within
 * each cluster a greedy sweep (sorted by top, ties broken by longer item
 * first) assigns the first column whose last-placed item has already
 * ended; every item in a cluster shares that cluster's final column
 * count, which is the simple, widely-used approach for calendar-style
 * side-by-side layout (Google Calendar does the same).
 */
function assignOverlapColumns<T extends { topPercent: number; heightPercent: number }>(
  items: T[]
): Array<T & { column: number; columnCount: number }> {
  const n = items.length;
  if (n === 0) return [];
  if (n === 1) return [{ ...items[0], column: 0, columnCount: 1 }];

  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  const overlaps = (a: T, b: T): boolean => {
    const aEnd = a.topPercent + a.heightPercent;
    const bEnd = b.topPercent + b.heightPercent;
    return a.topPercent < bEnd && b.topPercent < aEnd;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (overlaps(items[i], items[j])) union(i, j);
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const list = clusters.get(root);
    if (list) list.push(i);
    else clusters.set(root, [i]);
  }

  const columnOf = new Array<number>(n);
  const columnCountOf = new Array<number>(n);

  for (const indices of clusters.values()) {
    const sorted = [...indices].sort((a, b) => {
      const byTop = items[a].topPercent - items[b].topPercent;
      if (byTop !== 0) return byTop;
      return items[b].heightPercent - items[a].heightPercent; // longer item first on ties
    });

    // columnEnds[c] = bottom-percent of the last item placed in column c
    const columnEnds: number[] = [];
    for (const idx of sorted) {
      const item = items[idx];
      let placedColumn = -1;
      for (let c = 0; c < columnEnds.length; c += 1) {
        if (columnEnds[c] <= item.topPercent) {
          placedColumn = c;
          break;
        }
      }
      if (placedColumn === -1) {
        placedColumn = columnEnds.length;
        columnEnds.push(item.topPercent + item.heightPercent);
      } else {
        columnEnds[placedColumn] = item.topPercent + item.heightPercent;
      }
      columnOf[idx] = placedColumn;
    }
    for (const idx of indices) columnCountOf[idx] = columnEnds.length;
  }

  return items.map((item, i) => ({ ...item, column: columnOf[i], columnCount: columnCountOf[i] }));
}

interface WindowLayoutResult {
  positioned: DayTimelinePositionedItem[];
  allDay: DayTimelineItemLike[];
  nowPercent: number | null;
}

/**
 * Core per-day positioning shared by `buildDayTimeline` (which computes
 * its own per-day window) and `buildWeekTimeline` (which passes one
 * shared window so hour rows align across every day column).
 */
function layoutItemsForWindow(
  day: Date,
  items: DayTimelineItemLike[],
  startHour: number,
  endHour: number,
  now?: Date
): WindowLayoutResult {
  const allDay = items.filter((item) => item.allDay);
  const timed = items.filter((item) => !item.allDay);

  const dayStartMs = startOfDay(day).getTime();
  const dayEndMs = endOfDay(day).getTime();
  const windowStartMs = dayStartMs + startHour * 3_600_000;
  const windowEndMs = dayStartMs + endHour * 3_600_000;
  const windowSpanMs = windowEndMs - windowStartMs;

  const toPercent = (ms: number): number => {
    const clamped = Math.min(Math.max(ms, windowStartMs), windowEndMs);
    return ((clamped - windowStartMs) / windowSpanMs) * 100;
  };

  const unpositioned = timed.map((item) => {
    const clippedStartMs = Math.max(item.startsAt.getTime(), dayStartMs);
    const clippedEndMs = Math.min(Math.max(item.endsAt.getTime(), clippedStartMs), dayEndMs);
    const topPercent = toPercent(clippedStartMs);
    const bottomPercent = toPercent(clippedEndMs);
    const heightPercent = Math.max(bottomPercent - topPercent, MIN_HEIGHT_PERCENT);
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      topPercent,
      heightPercent,
    };
  });

  const positioned = assignOverlapColumns(unpositioned);

  let nowPercent: number | null = null;
  if (now && isSameCalendarDay(now, day)) {
    const nowHour = hourOfDay(now);
    if (nowHour >= startHour && nowHour <= endHour) {
      nowPercent = toPercent(now.getTime());
    }
  }

  return { positioned, allDay, nowPercent };
}

/**
 * Lays out one calendar day as an hour-positioned timeline: all-day items
 * (birthdays, time off, etc.) are split into their own bucket rather than
 * positioned, every other item gets a {topPercent, heightPercent} within
 * the computed hour window (clipped to the window and to the day's actual
 * bounds, so a multi-day event only shows the slice that falls on `day`),
 * time-overlapping items are split into side-by-side columns, and resolved
 * travel legs become their own positioned segments dropped into the gap
 * between the two events they connect. Pass `now` to also get a `now`
 * indicator position when `day` is today.
 */
export function buildDayTimeline(
  day: Date,
  items: DayTimelineItemLike[],
  travelLegs: DayTimelineTravelLeg[] = [],
  now?: Date
): DayTimelineLayout {
  const timed = items.filter((item) => !item.allDay);
  const { startHour, endHour } = computeTimelineWindow(timed);
  const { positioned, allDay, nowPercent } = layoutItemsForWindow(day, items, startHour, endHour, now);

  const positionedById = new Map(positioned.map((item) => [item.id, item]));
  const travelSegments: DayTimelineTravelSegment[] = [];
  for (const leg of travelLegs) {
    const from = positionedById.get(leg.fromEventId);
    const to = positionedById.get(leg.toEventId);
    if (!from || !to) continue; // one side isn't on this day's timeline — nothing to draw

    const gapTopPercent = from.topPercent + from.heightPercent;
    const gapBottomPercent = to.topPercent;
    if (gapBottomPercent <= gapTopPercent) continue; // events touch or overlap — no travel gap to show

    travelSegments.push({
      fromEventId: leg.fromEventId,
      toEventId: leg.toEventId,
      minutes: leg.minutes,
      topPercent: gapTopPercent,
      heightPercent: gapBottomPercent - gapTopPercent,
    });
  }

  const hourLabels: string[] = [];
  for (let h = startHour; h <= endHour; h += 1) {
    hourLabels.push(formatHourLabel(h));
  }

  return { startHour, endHour, hourLabels, positioned, allDay, travelSegments, nowPercent };
}

export interface WeekTimelineDay {
  date: Date;
  positioned: DayTimelinePositionedItem[];
  allDay: DayTimelineItemLike[];
  nowPercent: number | null;
}

export interface WeekTimelineLayout {
  startHour: number;
  endHour: number;
  hourLabels: string[];
  days: WeekTimelineDay[];
}

/**
 * Week-view counterpart to `buildDayTimeline`: lays out several days
 * side-by-side sharing ONE hour window (computed across every timed item
 * in every day), so hour rows line up across day columns the way
 * Google/Apple/Outlook's week view does. `itemsPerDay` must be the same
 * length and order as `days`.
 */
export function buildWeekTimeline(days: Date[], itemsPerDay: DayTimelineItemLike[][], now?: Date): WeekTimelineLayout {
  const allTimed = itemsPerDay.flat().filter((item) => !item.allDay);
  const { startHour, endHour } = computeTimelineWindow(allTimed);

  const weekDays: WeekTimelineDay[] = days.map((date, i) => {
    const { positioned, allDay, nowPercent } = layoutItemsForWindow(date, itemsPerDay[i] ?? [], startHour, endHour, now);
    return { date, positioned, allDay, nowPercent };
  });

  const hourLabels: string[] = [];
  for (let h = startHour; h <= endHour; h += 1) {
    hourLabels.push(formatHourLabel(h));
  }

  return { startHour, endHour, hourLabels, days: weekDays };
}
