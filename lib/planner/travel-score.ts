// Travel feasibility component (Section 9.4): how much of an available
// weekend block a round trip would consume. Pure.
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function scoreTravelFeasibility(travelMinutesEachWay: number, availableBlockMinutes: number): number {
  if (availableBlockMinutes <= 0) return 0;
  const roundTripMinutes = travelMinutesEachWay * 2;
  if (roundTripMinutes >= availableBlockMinutes) return 0; // travel alone eats the whole block

  const travelFraction = roundTripMinutes / availableBlockMinutes;
  return clamp(Math.round(100 - travelFraction * 150), 0, 100);
}
