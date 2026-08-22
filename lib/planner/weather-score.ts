// One component of activity scoring (Section 9.4). Pure, generic across
// activity types — a fuller model would vary the ideal range per activity
// (golf tolerates heat better than a long hike), but a single reasonable
// "pleasant outdoor conditions" profile is a defensible v1 default; the
// aggregation contract in scoring.ts is what the spec actually requires to
// be reproducible/tunable, not this component's internal curve.
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface WeatherSuitabilityInputs {
  tempF: number | null;
  precipChancePercent: number | null;
  windMph: number | null;
}

const IDEAL_TEMP_LOW_F = 55;
const IDEAL_TEMP_HIGH_F = 80;
const WIND_COMFORT_THRESHOLD_MPH = 15;

export function scoreWeatherSuitability(inputs: WeatherSuitabilityInputs): number {
  if (inputs.tempF == null) return 50; // unknown -> neutral, never guess a condition

  let score = 100;

  if (inputs.tempF < IDEAL_TEMP_LOW_F) {
    score -= Math.min(50, (IDEAL_TEMP_LOW_F - inputs.tempF) * 2);
  } else if (inputs.tempF > IDEAL_TEMP_HIGH_F) {
    score -= Math.min(50, (inputs.tempF - IDEAL_TEMP_HIGH_F) * 2);
  }

  if (inputs.precipChancePercent != null) {
    score -= inputs.precipChancePercent * 0.6;
  }

  if (inputs.windMph != null && inputs.windMph > WIND_COMFORT_THRESHOLD_MPH) {
    score -= Math.min(25, (inputs.windMph - WIND_COMFORT_THRESHOLD_MPH) * 1.5);
  }

  return clamp(Math.round(score), 0, 100);
}
