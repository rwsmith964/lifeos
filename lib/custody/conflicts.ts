import { endOfDay, startOfDay } from "date-fns";
import {
  workShiftsInRange,
  type PersonLike,
  type TimeOffLike,
  type WorkScheduleLike,
  type WorkShiftCalendarItem,
} from "../calendar/work-schedule";

// D-068: custody/work-schedule conflict detection. A custody block says
// "this person is responsible for this child during this window" — if that
// same person also has a work shift overlapping the window, they're
// double-booked and probably need to arrange coverage. Computed at render
// time from the already-tested workShiftsInRange occurrence generator
// (same "computed, not materialized" philosophy as D-064/D-062) rather
// than a new persisted table — there's nothing to individually edit about
// a detected conflict, only the underlying block or shift, and re-deriving
// it on every page load is cheap for the bounded windows the custody pages
// actually render.
//
// Deliberately checks whichever person is responsible_person_id on each
// block, not just co_parent-typed people — a conflict is "the person on
// duty is also scheduled to work," which applies just as much to the
// primary household adult as to a co-parent.

export interface CustodyBlockLike {
  id: string;
  child_person_id: string;
  responsible_person_id: string;
  starts_at: string; // ISO timestamptz
  ends_at: string; // ISO timestamptz
}

export interface CustodyWorkConflict {
  custodyBlockId: string;
  childPersonId: string;
  childName: string;
  responsiblePersonId: string;
  responsiblePersonName: string;
  shiftLabel: string;
  overlapStart: Date;
  overlapEnd: Date;
}

function displayName(person: PersonLike): string {
  return person.nickname ?? person.full_name;
}

function shiftWindow(item: WorkShiftCalendarItem): { start: Date; end: Date } {
  const [startHour, startMinute] = item.startTime.split(":").map(Number);
  const [endHour, endMinute] = item.endTime.split(":").map(Number);
  const start = new Date(item.date);
  start.setHours(startHour, startMinute, 0, 0);
  const end = new Date(item.date);
  end.setHours(endHour, endMinute, 0, 0);
  return { start, end };
}

/**
 * For every custody block, checks whether the responsible person has a
 * work shift (expanded from their weekly work_schedules, minus any day
 * covered by time off) that overlaps the block's [starts_at, ends_at)
 * window. Returns one CustodyWorkConflict per overlapping shift.
 */
export function detectCustodyWorkConflicts(
  blocks: CustodyBlockLike[],
  schedules: WorkScheduleLike[],
  timeOff: TimeOffLike[],
  people: PersonLike[]
): CustodyWorkConflict[] {
  if (blocks.length === 0 || schedules.length === 0) return [];
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const conflicts: CustodyWorkConflict[] = [];

  for (const block of blocks) {
    const blockStart = new Date(block.starts_at);
    const blockEnd = new Date(block.ends_at);
    const relevantSchedules = schedules.filter((s) => s.person_id === block.responsible_person_id);
    if (relevantSchedules.length === 0) continue;

    const shifts = workShiftsInRange(relevantSchedules, timeOff, people, startOfDay(blockStart), endOfDay(blockEnd));
    for (const shift of shifts) {
      const { start, end } = shiftWindow(shift);
      const overlapStart = start > blockStart ? start : blockStart;
      const overlapEnd = end < blockEnd ? end : blockEnd;
      if (overlapStart >= overlapEnd) continue; // touching edges, not a real overlap

      const child = peopleById.get(block.child_person_id);
      conflicts.push({
        custodyBlockId: block.id,
        childPersonId: block.child_person_id,
        childName: child ? displayName(child) : "Unknown",
        responsiblePersonId: block.responsible_person_id,
        responsiblePersonName: shift.personName,
        shiftLabel: shift.label,
        overlapStart,
        overlapEnd,
      });
    }
  }

  return conflicts;
}
