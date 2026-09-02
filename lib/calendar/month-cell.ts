// D-132: pure layout helpers for the month-grid day cell. Split out of
// app/(app)/calendar/page.tsx so the density/overflow and custody-frame math
// is unit-testable without rendering a server component. Never touches the
// DB -- callers pass already-fetched items for a single calendar day.
import { format } from "date-fns";

export interface MonthCellItemLike {
  id: string;
  title: string;
  startsAt: Date;
  allDay: boolean;
  kind: "event" | "custody" | "birthday" | "work_shift" | "time_off";
}

export interface MonthCellChip {
  id: string;
  label: string;
  kind: MonthCellItemLike["kind"];
}

export interface MonthCellChips {
  visible: MonthCellChip[];
  overflowCount: number;
}

/**
 * Picks the first `maxVisible` items (already time-sorted by the caller,
 * matching the existing `items` sort in page.tsx) to render as inline text
 * chips in a month cell, plus how many more didn't fit. Custody items are
 * deliberately excluded here -- they get their own frame bar
 * (buildMonthCellCustodyBars below) instead of a text chip, so they don't
 * eat into the same slot budget as real events/birthdays/shifts.
 */
export function buildMonthCellChips(items: MonthCellItemLike[], maxVisible: number): MonthCellChips {
  const chippable = items.filter((i) => i.kind !== "custody");
  const visible = chippable.slice(0, maxVisible).map((item) => ({
    id: item.id,
    kind: item.kind,
    label: item.allDay ? item.title : `${format(item.startsAt, "h:mma").toLowerCase()} ${item.title}`,
  }));
  return { visible, overflowCount: Math.max(0, chippable.length - maxVisible) };
}

export interface CustodyBlockLike {
  id: string;
  childPersonId: string;
  responsiblePersonId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface CustodyFrameSegment {
  startPercent: number;
  widthPercent: number;
  responsiblePersonId: string;
}

export interface CustodyFrameRow {
  childPersonId: string;
  segments: CustodyFrameSegment[];
}

/**
 * Turns a day's custody blocks into one frame row per child, each row made
 * of one or more horizontal segments sized by what fraction of the day the
 * block actually covers -- a full-day block is one 0-100% segment (a solid
 * frame), a half-day handover produces two segments in two colors (a split
 * frame), matching the request to show "a chunk of the day" rather than
 * always shading the whole cell. Blocks are clipped to [dayStart, dayEnd)
 * since a block can span multiple days but this cell only cares about its
 * own day's slice. Rows are ordered by childPersonId so rendering is stable
 * across re-renders (no dependency on DB return order).
 */
export function buildMonthCellCustodyBars(day: Date, custodyBlocksForDay: CustodyBlockLike[]): CustodyFrameRow[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayMs = dayEnd.getTime() - dayStart.getTime();

  const byChild = new Map<string, CustodyBlockLike[]>();
  for (const block of custodyBlocksForDay) {
    byChild.set(block.childPersonId, [...(byChild.get(block.childPersonId) ?? []), block]);
  }

  const rows: CustodyFrameRow[] = [];
  for (const childPersonId of [...byChild.keys()].sort()) {
    const blocks = byChild.get(childPersonId)!.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const segments: CustodyFrameSegment[] = blocks.map((block) => {
      const clippedStart = Math.max(block.startsAt.getTime(), dayStart.getTime());
      const clippedEnd = Math.min(block.endsAt.getTime(), dayEnd.getTime());
      const startPercent = ((clippedStart - dayStart.getTime()) / dayMs) * 100;
      const endPercent = ((clippedEnd - dayStart.getTime()) / dayMs) * 100;
      return {
        startPercent: Math.max(0, Math.min(100, startPercent)),
        widthPercent: Math.max(0, Math.min(100, endPercent) - Math.max(0, startPercent)),
        responsiblePersonId: block.responsiblePersonId,
      };
    });
    rows.push({ childPersonId, segments });
  }
  return rows;
}
