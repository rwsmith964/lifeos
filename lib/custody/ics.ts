// Builds an RFC 5545 (iCalendar) document for a custody schedule so it
// can be imported into any calendar app (Google Calendar, Apple
// Calendar, Outlook, etc.) — e.g. by a co-parent who has no LifeOS
// account of their own. Pure and DB-free, like the rest of
// lib/custody/* — callers project the schedule into days first (via
// lib/custody/schedule.ts) and pass the result in here.
import { addDays, format, parseISO } from "date-fns";
import { APP_NAME } from "@/lib/constants";
import type { ProjectedCustodyDay, ProjectedCustodyInterval } from "./schedule";

interface MergedIcsRun {
  startDate: string; // yyyy-MM-dd, inclusive
  endDate: string; // yyyy-MM-dd, inclusive (last day covered)
  responsiblePersonId: string;
  hasException: boolean;
}

/**
 * Merges consecutive same-parent days into single runs — one calendar
 * event per contiguous span, not one per day. Mirrors
 * lib/custody/materialize.ts's private mergeConsecutiveDays exactly
 * (kept as a separate copy since that one is materialize-specific and
 * this module is intentionally DB-free).
 */
export function mergeCustodyRuns(days: ProjectedCustodyDay[]): MergedIcsRun[] {
  const runs: MergedIcsRun[] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    const isConsecutive = last && format(addDays(parseISO(last.endDate), 1), "yyyy-MM-dd") === day.date;
    if (last && isConsecutive && last.responsiblePersonId === day.responsiblePersonId) {
      last.endDate = day.date;
      last.hasException = last.hasException || day.isException;
    } else {
      runs.push({ startDate: day.date, endDate: day.date, responsiblePersonId: day.responsiblePersonId, hasException: day.isException });
    }
  }
  return runs;
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Folds a line at 75 octets per RFC 5545 §3.1 (continuation lines start with a single space). Fine to operate on UTF-16 code units here — names/notes are short enough that the rare multi-byte edge case doesn't matter for a personal calendar export. */
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

export interface BuildCustodyIcsInput {
  scheduleId: string;
  childName: string;
  runs: MergedIcsRun[];
  peopleNamesById: Map<string, string>;
  generatedAt?: Date;
}

/**
 * Builds a full VCALENDAR document, one all-day VEVENT per merged run.
 * DTEND is exclusive per RFC 5545 (the day after the run's last day),
 * matching how every calendar app expects an all-day multi-day event's
 * end to be expressed.
 */
export function buildCustodyIcs({ scheduleId, childName, runs, peopleNamesById, generatedAt = new Date() }: BuildCustodyIcsInput): string {
  const stamp = format(generatedAt, "yyyyMMdd'T'HHmmss'Z'");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME}//Custody Schedule Export//EN`,
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(`${childName} — custody schedule`)}`,
  ];

  for (const run of runs) {
    const personName = peopleNamesById.get(run.responsiblePersonId) ?? "Unknown";
    const dtStart = toIcsDate(run.startDate);
    const dtEndExclusive = toIcsDate(format(addDays(parseISO(run.endDate), 1), "yyyy-MM-dd"));
    const summary = `${childName} with ${personName}`;
    // Stable across regenerations (same schedule + same start date always
    // produces the same UID), so re-importing an updated export in a
    // calendar app that dedupes by UID updates the existing event rather
    // than duplicating it.
    const uid = `${scheduleId}-${run.startDate}@lifeos-custody`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEndExclusive}`,
      `SUMMARY:${escapeIcsText(summary)}`
    );
    if (run.hasException) {
      lines.push(`DESCRIPTION:${escapeIcsText("Exception day — overrides the regular cycle.")}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

function toIcsFloatingDateTime(naiveDateTime: string): string {
  // naiveDateTime is "yyyy-MM-ddTHH:mm:00" (see ProjectedCustodyInterval).
  // Emitted with no trailing Z and no TZID — a "floating" local time per
  // RFC 5545 §3.3.5, which every mainstream calendar app renders in the
  // *importing* device's own local timezone. That is the right behavior
  // here: a 4:30pm handoff should show as 4:30pm wherever it's viewed,
  // matching how the naive strings are already treated everywhere else
  // in lib/custody/* (no household timezone is stored — see D-125).
  return naiveDateTime.replace(/[-:]/g, "").replace(/(\d{8}T\d{6}).*/, "$1");
}

export interface BuildTimedCustodyIcsInput {
  scheduleId: string;
  childName: string;
  intervals: ProjectedCustodyInterval[];
  peopleNamesById: Map<string, string>;
  generatedAt?: Date;
}

/**
 * Timed counterpart to buildCustodyIcs, for weekly_segments schedules —
 * one VEVENT per projected interval with a real clock start/end instead
 * of an all-day VALUE=DATE event, so a split day (e.g. Friday handoff at
 * 4:30pm) exports as two correctly-timed events rather than one all-day
 * block. Intervals are expected pre-merged across day boundaries (which
 * projectWeeklySegmentSchedule already does), so no further merging
 * happens here.
 */
export function buildTimedCustodyIcs({
  scheduleId,
  childName,
  intervals,
  peopleNamesById,
  generatedAt = new Date(),
}: BuildTimedCustodyIcsInput): string {
  const stamp = format(generatedAt, "yyyyMMdd'T'HHmmss'Z'");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME}//Custody Schedule Export//EN`,
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(`${childName} — custody schedule`)}`,
  ];

  for (const interval of intervals) {
    const personName = peopleNamesById.get(interval.responsiblePersonId) ?? "Unknown";
    const dtStart = toIcsFloatingDateTime(interval.startsAt);
    const dtEnd = toIcsFloatingDateTime(interval.endsAt);
    const summary = `${childName} with ${personName}`;
    // Stable across regenerations, like buildCustodyIcs's UID.
    const uid = `${scheduleId}-${interval.startsAt}@lifeos-custody`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcsText(summary)}`
    );
    if (interval.isException) {
      lines.push(`DESCRIPTION:${escapeIcsText("Exception day — overrides the regular weekly pattern.")}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
