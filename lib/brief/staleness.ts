// P1-13: the daily brief is generated once per person per day and then
// read from cache (see generateDailyBrief's `getBriefForPersonAndDate`
// early-return) — but the events, custody blocks, and people it was built
// from can change afterward (e.g. adding a weekend event after the brief
// already ran). Fix: surface *when* the brief was generated, and detect
// when anything it depended on has changed more recently, so the Brief
// page can show a "this may be out of date" hint instead of silently
// serving stale content next to fresh underlying data.
//
// Pure function — the caller queries the same tables/window
// generateDailyBrief reads from (events + custody blocks in the
// today..+2-day window, and the household's people) and passes just the
// timestamp columns in here.

export interface TimestampedRow {
  created_at: string;
  updated_at: string;
}

/**
 * True when any of the given rows were created or last updated after the
 * brief was generated — i.e. the brief's snapshot of the world is no
 * longer current.
 */
export function isBriefStale(generatedAt: string, rows: TimestampedRow[]): boolean {
  const generatedAtMs = new Date(generatedAt).getTime();
  return rows.some(
    (row) =>
      new Date(row.updated_at).getTime() > generatedAtMs ||
      new Date(row.created_at).getTime() > generatedAtMs
  );
}
