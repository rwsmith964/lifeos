// Redesign (docs/redesign-brief.md Part 2 — Calendar): "Custody ribbon
// above the day headers: continuous named bands ... replacing the current
// unlabelled bars." Pure, DB-free, unit-testable like month-cell.ts (which
// this is the week-level counterpart to) -- merges consecutive days with
// the same responsible parent into one labeled band per child, instead of
// month view's per-day frame segments.
import type { CustodyBlockLike } from "./month-cell";

export interface WeekCustodyBand {
  childPersonId: string;
  responsiblePersonId: string;
  startDayIndex: number;
  endDayIndex: number;
  /** The real end time of the block covering the band's last day -- the
   * actual handover moment, for a label like "through Saturday 4:00 PM". */
  handoverAt: Date | null;
}

function middayOf(day: Date): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
  return d;
}

/** Who's responsible for this child at midday on this day, or null if no block covers it. */
function responsibleAt(blocks: CustodyBlockLike[], midday: Date): CustodyBlockLike | null {
  return blocks.find((b) => b.startsAt <= midday && b.endsAt > midday) ?? null;
}

export function buildWeekCustodyRibbon(
  gridDays: Date[],
  custodyBlocksByChild: Map<string, CustodyBlockLike[]>
): WeekCustodyBand[] {
  const bands: WeekCustodyBand[] = [];

  for (const [childPersonId, blocks] of custodyBlocksByChild) {
    const perDay: (string | null)[] = gridDays.map((day) => responsibleAt(blocks, middayOf(day))?.responsiblePersonId ?? null);

    let i = 0;
    while (i < perDay.length) {
      if (perDay[i] == null) {
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < perDay.length && perDay[j + 1] === perDay[i]) j += 1;

      const endBlock = responsibleAt(blocks, middayOf(gridDays[j]));
      bands.push({
        childPersonId,
        responsiblePersonId: perDay[i]!,
        startDayIndex: i,
        endDayIndex: j,
        handoverAt: endBlock?.endsAt ?? null,
      });
      i = j + 1;
    }
  }

  return bands;
}
