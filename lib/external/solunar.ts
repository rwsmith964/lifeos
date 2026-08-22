// Solunar major/minor feeding periods (Section 9.2). Computed locally from
// lat/lng + moon phase via `suncalc` — no external call, no cache entry
// needed (deterministic astronomical math).
//
// Major periods are centered on moon transit (overhead) and moon underfoot
// (opposite), found by sampling moon altitude across the day rather than
// assuming a fixed offset from solar noon (the moon's transit time shifts
// day to day). Minor periods are centered on moonrise/moonset. Window
// widths (2h major, 1h minor) follow the commonly-used solunar convention.
// This is a reasonable, standard approximation, not a from-scratch theory —
// see DECISIONS.md D-017 for why it's a decision, not a QUESTIONS.md item.
import * as SunCalc from "suncalc";
import { addHours, addMinutes, startOfDay } from "date-fns";

const MAJOR_PERIOD_MINUTES = 120;
const MINOR_PERIOD_MINUTES = 60;
const SAMPLE_INTERVAL_MINUTES = 10;

export interface SolunarPeriod {
  type: "major" | "minor";
  start: Date;
  end: Date;
}

export interface SolunarResult {
  date: Date;
  moonPhaseFraction: number; // 0 = new moon, 1 = full moon (illumination fraction)
  moonrise: Date | null;
  moonset: Date | null;
  periods: SolunarPeriod[];
}

function centeredPeriod(center: Date, totalMinutes: number, type: SolunarPeriod["type"]): SolunarPeriod {
  const half = totalMinutes / 2;
  return { type, start: addMinutes(center, -half), end: addMinutes(center, half) };
}

export function computeSolunarPeriods(date: Date, lat: number, lng: number): SolunarResult {
  const dayStart = startOfDay(date);
  const dayEnd = addHours(dayStart, 24);

  const moonTimes = SunCalc.getMoonTimes(dayStart, lat, lng);
  const illumination = SunCalc.getMoonIllumination(dayStart);

  const samples: { time: Date; altitude: number }[] = [];
  const windowStart = addHours(dayStart, -1); // small buffer either side of the day
  const windowEnd = addHours(dayEnd, 1);
  for (let t = windowStart; t <= windowEnd; t = addMinutes(t, SAMPLE_INTERVAL_MINUTES)) {
    samples.push({ time: t, altitude: SunCalc.getMoonPosition(t, lat, lng).altitude });
  }

  const withinDay = samples.filter((s) => s.time >= dayStart && s.time < dayEnd);
  const transit = withinDay.reduce((max, s) => (s.altitude > max.altitude ? s : max), withinDay[0]);
  const underfoot = withinDay.reduce((min, s) => (s.altitude < min.altitude ? s : min), withinDay[0]);

  const periods: SolunarPeriod[] = [
    centeredPeriod(transit.time, MAJOR_PERIOD_MINUTES, "major"),
    centeredPeriod(underfoot.time, MAJOR_PERIOD_MINUTES, "major"),
  ];
  if (moonTimes.rise) periods.push(centeredPeriod(moonTimes.rise, MINOR_PERIOD_MINUTES, "minor"));
  if (moonTimes.set) periods.push(centeredPeriod(moonTimes.set, MINOR_PERIOD_MINUTES, "minor"));

  periods.sort((a, b) => a.start.getTime() - b.start.getTime());

  return {
    date: dayStart,
    moonPhaseFraction: illumination.fraction,
    moonrise: moonTimes.rise ?? null,
    moonset: moonTimes.set ?? null,
    periods,
  };
}
