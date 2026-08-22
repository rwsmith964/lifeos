// Open-block finding for the weekend planner (Section 9.1: "Looks ahead at
// open blocks in the coming weekend"). Pure — takes a waking-hours window
// and a list of busy periods (calendar events + custody blocks already
// fetched by the caller), returns the free gaps.
export interface BusyPeriod {
  start: Date;
  end: Date;
}

export interface OpenBlock {
  start: Date;
  end: Date;
  durationMinutes: number;
}

export function findOpenBlocks(windowStart: Date, windowEnd: Date, busyPeriods: BusyPeriod[]): OpenBlock[] {
  const sorted = [...busyPeriods]
    .filter((b) => b.end > windowStart && b.start < windowEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const blocks: OpenBlock[] = [];
  let cursor = windowStart;

  for (const busy of sorted) {
    const busyStart = busy.start < windowStart ? windowStart : busy.start;
    const busyEnd = busy.end > windowEnd ? windowEnd : busy.end;
    if (busyStart > cursor) {
      blocks.push(makeBlock(cursor, busyStart));
    }
    if (busyEnd > cursor) cursor = busyEnd;
  }

  if (cursor < windowEnd) {
    blocks.push(makeBlock(cursor, windowEnd));
  }

  return blocks.filter((b) => b.durationMinutes > 0);
}

function makeBlock(start: Date, end: Date): OpenBlock {
  return { start, end, durationMinutes: (end.getTime() - start.getTime()) / 60000 };
}

export function largestOpenBlock(blocks: OpenBlock[]): OpenBlock | null {
  if (blocks.length === 0) return null;
  return blocks.reduce((max, b) => (b.durationMinutes > max.durationMinutes ? b : max));
}
