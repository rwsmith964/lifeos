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
 * Lays out one calendar day as an hour-positioned timeline: all-day items
 * (birthdays, time off, etc.) are split into their own bucket rather than
 * positioned, every other item gets a {topPercent, heightPercent} within
 * the computed hour window (clipped to the window and to the day's actual
 * bounds, so a multi-day event only shows the slice that falls on `day`),
 * and resolved travel legs become their own positioned segments dropped
 * into the gap between the two events they connect.
 */
export function buildDayTimeline(
  day: Date,
  items: DayTimelineItemLike[],
  travelLegs: DayTimelineTravelLeg[] = []
): DayTimelineLayout {
  const allDay = items.filter((item) => item.allDay);
  const timed = items.filter((item) => !item.allDay);

  const { startHour, endHour } = computeTimelineWindow(timed);
  const windowStart = startOfDay(day);
  windowStart.setHours(0, 0, 0, 0);
  const windowStartMs = startOfDay(day).getTime() + startHour * 3_600_000;
  const windowEndMs = startOfDay(day).getTime() + endHour * 3_600_000;
  const windowSpanMs = windowEndMs - windowStartMs;
  const dayStartMs = startOfDay(day).getTime();
  const dayEndMs = endOfDay(day).getTime();

  const toPercent = (ms: number): number => {
    const clamped = Math.min(Math.max(ms, windowStartMs), windowEndMs);
    return ((clamped - windowStartMs) / windowSpanMs) * 100;
  };

  const positioned: DayTimelinePositionedItem[] = timed.map((item) => {
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

  return { startHour, endHour, hourLabels, positioned, allDay, travelSegments };
}
