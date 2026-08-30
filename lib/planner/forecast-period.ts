// D-070 (P1-8): extracted from lib/opportunities/detect.ts so both the
// opportunity detector and the weekend planner pick the forecast period for
// a target date the same way. Before this, generate.ts read
// `forecast.data.periods[0]` unconditionally -- correct only when the plan
// happens to be generated on the same day it's scoring, and silently wrong
// (scoring "today's" weather against a future Saturday) any other day. That
// was part of why the two surfaces could show different numbers for the
// same activity/day (P1-8's bug report).
import { setHours, startOfDay } from "date-fns";
import type { NwsForecastPeriod } from "../external/nws";

const WAKING_HOUR_START = 8;
const WAKING_HOUR_END = 20;

/**
 * NWS forecast periods aren't indexed by day -- each is a ~12hr day/night
 * span (startTime/endTime, ISO with offset) -- so for a given target date
 * there are usually two candidate periods (the daytime one and the
 * overnight one straddling midnight). Picks whichever period overlaps the
 * most of that date's waking hours (8am-8pm), and returns null if none of
 * the returned periods cover the date at all (i.e. it's beyond the
 * forecast horizon, or the adapter had no data).
 */
export function bestForecastPeriodForDate(
  periods: NwsForecastPeriod[],
  targetDate: Date
): NwsForecastPeriod | null {
  const wakingStart = setHours(startOfDay(targetDate), WAKING_HOUR_START).getTime();
  const wakingEnd = setHours(startOfDay(targetDate), WAKING_HOUR_END).getTime();

  let best: { period: NwsForecastPeriod; overlapMs: number } | null = null;
  for (const period of periods) {
    const start = new Date(period.startTime).getTime();
    const end = new Date(period.endTime).getTime();
    const overlapMs = Math.min(end, wakingEnd) - Math.max(start, wakingStart);
    if (overlapMs <= 0) continue;
    if (!best || overlapMs > best.overlapMs) best = { period, overlapMs };
  }
  return best?.period ?? null;
}
