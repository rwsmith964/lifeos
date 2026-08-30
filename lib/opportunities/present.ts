// D-070 (P1-6): the single presentation-layer function all three render
// surfaces (Opportunities page, Brief card, Calendar weekend nudge) call
// instead of reading raw opportunity rows directly.
//
// Before this, every row the detector wrote (as many as 24+ across a
// 7-day scan) was shown as-is: near-every row scored 100 and every one
// said "Exceptional," so the label carried no signal, and two separate
// `user_activities` rows for the same real-world thing ("Golf at Fiddlers
// Green" and "Golf at Oakway Golf Course") showed up as two different
// cards on the same day. Fixes:
//  - dedupe same-family activities per day, keeping only the
//    highest-scoring one ("family" = the activity type with any
//    " at <location>" suffix stripped, so both golf rows collapse to one
//    "golf" family)
//  - a real floor (STANDOUT_MIN_SCORE) so "nothing stands out" is an
//    honest, representable outcome, not just a long list of mediocre
//    scores
//  - a hard cap on how many candidates get shown at all
//  - tier labels ("Exceptional"/"Great"/"Good") assigned only here, by
//    rank among the surviving candidates -- never baked into the stored
//    headline, so "Exceptional" always means "the actual best one this
//    week," not "the ~30th row the detector happened to insert."
import { compareAsc, parseISO } from "date-fns";
import type { OpportunityWithSubject } from "../db/repositories/opportunities";

export const STANDOUT_MIN_SCORE = 70;
export const MAX_PRESENTED_OPPORTUNITIES = 5;

export type OpportunityTier = "Exceptional" | "Great" | "Good";

export interface PresentedOpportunity extends OpportunityWithSubject {
  tier: OpportunityTier;
  /** Family key used for this cycle's dedupe -- exposed for tests/debugging, not for display. */
  familyKey: string;
}

export interface PresentedOpportunityDay {
  forDate: string;
  opportunities: PresentedOpportunity[];
}

export interface PresentedOpportunities {
  /** Flat, rank-ordered list (best first) capped at MAX_PRESENTED_OPPORTUNITIES -- what the Brief card and Calendar nudge slice from. */
  flat: PresentedOpportunity[];
  /** Same candidates grouped by day, day-ascending -- what the /opportunities page renders. */
  byDay: PresentedOpportunityDay[];
}

/** Strips a trailing " at <location>" (case-insensitive) so "Golf at Fiddlers Green" and "Golf at Oakway Golf Course" collapse to the same family, "golf". Trip-idea opportunities key by their own id so distinct trip ideas are never merged into each other. */
export function familyKeyFor(opportunity: Pick<OpportunityWithSubject, "activity_id" | "trip_idea_id" | "subjectName">): string {
  if (opportunity.trip_idea_id) return `trip:${opportunity.trip_idea_id}`;
  return opportunity.subjectName.replace(/\s+at\s+.+$/i, "").trim().toLowerCase();
}

function tierForRank(rank: number): OpportunityTier {
  if (rank === 0) return "Exceptional";
  if (rank <= 2) return "Great";
  return "Good";
}

export function getPresentedOpportunities(opportunities: OpportunityWithSubject[]): PresentedOpportunities {
  // Dedupe by (for_date, family) keeping the highest score. Input is
  // already score-desc from the repository query, so the first row seen
  // per key is the keeper.
  const bestByDayAndFamily = new Map<string, OpportunityWithSubject>();
  for (const opp of opportunities) {
    if (opp.score < STANDOUT_MIN_SCORE) continue;
    const key = `${opp.for_date}::${familyKeyFor(opp)}`;
    const existing = bestByDayAndFamily.get(key);
    if (!existing || opp.score > existing.score) bestByDayAndFamily.set(key, opp);
  }

  const deduped = Array.from(bestByDayAndFamily.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return compareAsc(parseISO(a.for_date), parseISO(b.for_date));
  });

  const capped = deduped.slice(0, MAX_PRESENTED_OPPORTUNITIES);
  const flat: PresentedOpportunity[] = capped.map((opp, rank) => ({
    ...opp,
    tier: tierForRank(rank),
    familyKey: familyKeyFor(opp),
  }));

  const byDayMap = new Map<string, PresentedOpportunity[]>();
  for (const opp of flat) {
    const bucket = byDayMap.get(opp.for_date);
    if (bucket) bucket.push(opp);
    else byDayMap.set(opp.for_date, [opp]);
  }
  const byDay: PresentedOpportunityDay[] = Array.from(byDayMap.entries())
    .sort(([a], [b]) => compareAsc(parseISO(a), parseISO(b)))
    .map(([forDate, dayOpportunities]) => ({ forDate, opportunities: dayOpportunities }));

  return { flat, byDay };
}
