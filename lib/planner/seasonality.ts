// D-085 (P3-3): season window + daylight-requirement gating for activities.
// Pure, unit-tested -- same "the gating/scoring function decides, the AI
// only narrates" pattern as weather-score.ts and scoring.ts. Shared by the
// opportunity detector (lib/opportunities/detect.ts) and the weekend
// planner (lib/planner/generate.ts) so both surfaces apply the same rule.
import { endOfDay, startOfDay } from "date-fns";
import * as SunCalc from "suncalc";

export interface SeasonWindow {
  season_start_month: number | null;
  season_end_month: number | null;
}

/**
 * True when `date`'s month falls within [start, end] inclusive. Handles
 * wrap-around across the year boundary (e.g. start=11 end=2 covers Nov,
 * Dec, Jan, Feb -- a winter activity). NULL/NULL means year-round, so
 * every existing activity (which has no season window set) keeps behaving
 * exactly as it did before this feature existed.
 */
export function isActivityInSeason(activity: SeasonWindow, date: Date): boolean {
  const { season_start_month: start, season_end_month: end } = activity;
  if (start == null || end == null) return true;
  const month = date.getMonth() + 1;
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end; // wraps across the year boundary
}

export interface DaylightWindow {
  sunrise: Date;
  sunset: Date;
}

/**
 * Sunrise/sunset at `lat,lng` on `date`'s calendar day, via `suncalc` (the
 * same library lib/external/solunar.ts already uses -- a deterministic
 * local computation, no external call or cache entry needed).
 */
export function computeDaylightWindow(date: Date, lat: number, lng: number): DaylightWindow {
  const times = SunCalc.getTimes(date, lat, lng);
  if (times.sunrise && times.sunset) {
    return { sunrise: times.sunrise, sunset: times.sunset };
  }
  // suncalc types sunrise/sunset as `Date | null` for the polar-day/night
  // edge case, which never happens at any latitude this app supports (US
  // households) -- handled anyway rather than asserting non-null. `alwaysUp`
  // (polar day) means the whole day is daylight; anything else (polar
  // night) means none of it is.
  return times.alwaysUp ? { sunrise: startOfDay(date), sunset: endOfDay(date) } : { sunrise: endOfDay(date), sunset: endOfDay(date) };
}

/**
 * Minutes of overlap between a candidate open block and the daylight
 * window. The fixed 8am-8pm waking-hours window (available-blocks.ts)
 * includes hours after sunset for much of the year at this household's
 * latitude -- this is what actually tells a needs_daylight activity
 * whether the usable part of the block is long enough.
 */
export function daylightOverlapMinutes(
  block: { start: Date; end: Date },
  daylight: DaylightWindow
): number {
  const overlapStart = Math.max(block.start.getTime(), daylight.sunrise.getTime());
  const overlapEnd = Math.min(block.end.getTime(), daylight.sunset.getTime());
  return Math.max(0, (overlapEnd - overlapStart) / 60000);
}

/**
 * True when a needs_daylight activity's typical duration actually fits
 * inside the daylight portion of the candidate block. Activities that
 * don't need daylight always pass (their block is judged purely on the
 * existing weather/travel/recency scoring). A missing block (no open time
 * at all) fails a needs_daylight activity -- there's no daylight time to
 * check it against.
 */
export function hasSufficientDaylight(
  activity: { needs_daylight: boolean; typical_duration_minutes: number },
  block: { start: Date; end: Date } | null,
  daylight: DaylightWindow
): boolean {
  if (!activity.needs_daylight) return true;
  if (!block) return false;
  return daylightOverlapMinutes(block, daylight) >= activity.typical_duration_minutes;
}
