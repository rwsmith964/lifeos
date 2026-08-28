import { eachDayOfInterval, format, startOfDay } from "date-fns";

// D-064: computed work-shift occurrences, generated at render time from a
// person's weekly work_schedules rows — the same "computed, not
// materialized" philosophy as lib/calendar/birthdays.ts, just expanding a
// day-of-week rule instead of a yearly month/day rule. A time-off entry
// covering the day suppresses that person's shift for the day (see
// `isCoveredByTimeOff` below) — you don't work your normal Tuesday shift
// on a Tuesday you've booked off.

export interface WorkScheduleLike {
  id: string;
  person_id: string;
  day_of_week: number; // 0 = Sunday .. 6 = Saturday, matches Date#getDay()
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  label: string;
}

export interface TimeOffLike {
  id: string;
  person_id: string;
  start_date: string; // "yyyy-MM-dd"
  end_date: string; // "yyyy-MM-dd"
  reason: string;
}

export interface PersonLike {
  id: string;
  full_name: string;
  nickname: string | null;
}

export interface WorkShiftCalendarItem {
  personId: string;
  personName: string;
  date: Date;
  startTime: string;
  endTime: string;
  label: string;
  scheduleId: string;
}

export interface TimeOffCalendarItem {
  entryId: string;
  personId: string;
  personName: string;
  date: Date;
  reason: string;
}

function displayName(person: PersonLike): string {
  return person.nickname ?? person.full_name;
}

function ymd(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function isCoveredByTimeOff(personId: string, date: Date, timeOff: TimeOffLike[]): TimeOffLike | undefined {
  const key = ymd(date);
  return timeOff.find((t) => t.person_id === personId && t.start_date <= key && key <= t.end_date);
}

/**
 * Expands weekly work_schedules rows into individual shift occurrences for
 * every day in [rangeStart, rangeEnd] (inclusive). Skips a person's shift
 * on any day covered by one of their time_off entries.
 */
export function workShiftsInRange(
  schedules: WorkScheduleLike[],
  timeOff: TimeOffLike[],
  people: PersonLike[],
  rangeStart: Date,
  rangeEnd: Date
): WorkShiftCalendarItem[] {
  if (schedules.length === 0) return [];
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const items: WorkShiftCalendarItem[] = [];

  for (const day of eachDayOfInterval({ start: startOfDay(rangeStart), end: startOfDay(rangeEnd) })) {
    const dayOfWeek = day.getDay();
    for (const schedule of schedules) {
      if (schedule.day_of_week !== dayOfWeek) continue;
      if (isCoveredByTimeOff(schedule.person_id, day, timeOff)) continue;
      const person = peopleById.get(schedule.person_id);
      if (!person) continue;
      items.push({
        personId: schedule.person_id,
        personName: displayName(person),
        date: day,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        label: schedule.label,
        scheduleId: schedule.id,
      });
    }
  }
  return items;
}

/**
 * Time-off entries expanded to one item per covered day in range — mirrors
 * workShiftsInRange's per-day shape so the calendar page can merge both
 * into the same DayItem list without a separate rendering path.
 */
export function timeOffInRange(
  timeOff: TimeOffLike[],
  people: PersonLike[],
  rangeStart: Date,
  rangeEnd: Date
): TimeOffCalendarItem[] {
  if (timeOff.length === 0) return [];
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const items: TimeOffCalendarItem[] = [];

  for (const day of eachDayOfInterval({ start: startOfDay(rangeStart), end: startOfDay(rangeEnd) })) {
    const key = ymd(day);
    for (const entry of timeOff) {
      if (key < entry.start_date || key > entry.end_date) continue;
      const person = peopleById.get(entry.person_id);
      if (!person) continue;
      items.push({
        entryId: entry.id,
        personId: entry.person_id,
        personName: displayName(person),
        date: day,
        reason: entry.reason,
      });
    }
  }
  return items;
}

export function workShiftTitle(item: WorkShiftCalendarItem): string {
  return `${item.personName}: ${item.label} ${formatTime(item.startTime)}\u2013${formatTime(item.endTime)}`;
}

export function timeOffTitle(item: TimeOffCalendarItem): string {
  return item.reason ? `${item.personName} off work \u2014 ${item.reason}` : `${item.personName} off work`;
}

function formatTime(hhmm: string): string {
  const [hourStr, minute] = hhmm.split(":");
  const hour = Number(hourStr);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return minute === "00" ? `${displayHour} ${period}` : `${displayHour}:${minute} ${period}`;
}
