// D-127 bugfix: lib/db/repositories/calendar.ts's listCustodyBlocksForHouseholdInRange
// intentionally uses an *overlap* query (starts_at < windowEnd AND ends_at >
// windowStart) so the calendar grid can render a multi-day custody block on
// every day it spans (see D-033/round-2). generateDailyBrief and
// generateWeekendPlan reuse that same query for two different purposes —
// planner/opportunities treat the result as opaque busy time-ranges (fine,
// overlap semantics are exactly what "is the user free at this hour" needs),
// but the brief instead prints each block as a single-instant "event"
// happening at `starts_at`. For a multi-day weekly_segments run (e.g. Fri
// 4:30pm -> Mon 8:30am), that block overlaps every day in between, so the
// brief was re-announcing the same Friday 4:30pm/Monday 8:30am handover on
// Saturday and Sunday too — a "custody transition" that already happened
// days ago, misreported as happening today. See DECISIONS.md D-127.
//
// The fix: a custody block only belongs in the brief's flat event list when
// a handover actually happens inside the brief's own lookahead window — i.e.
// starts_at falls within [windowStart, windowEnd), exactly the semantics
// listEventsInRange already uses for ordinary calendar events. Pulled out as
// a pure, unit-testable predicate rather than inlined in generate.ts.
export interface CustodyBlockForTransitionFilter {
  starts_at: string;
}

/**
 * Keeps only the custody blocks whose handover actually happens within
 * [windowStart, windowEnd) — i.e. real transitions the brief should mention
 * today or tomorrow, not every day a multi-day block happens to overlap.
 */
export function filterActualCustodyTransitions<T extends CustodyBlockForTransitionFilter>(
  custodyBlocks: T[],
  windowStart: Date,
  windowEnd: Date
): T[] {
  return custodyBlocks.filter((block) => {
    const startsAt = new Date(block.starts_at).getTime();
    return startsAt >= windowStart.getTime() && startsAt < windowEnd.getTime();
  });
}
