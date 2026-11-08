// Quick Capture splits input into items. When most of them are places to go,
// it's a day to plan (a conversation about order, time and food), not a pile of
// notes to file, so it goes to the day planner instead of Brain Dump.
export const PLAN_DAY_HANDOFF_KEY = "lifeos:plan-day-handoff";

export function looksLikeDayPlan(itemTypes: string[]): boolean {
  if (itemTypes.length < 2) return false;
  const events = itemTypes.filter((t) => t === "create_calendar_event").length;
  return events >= 2 && events / itemTypes.length >= 0.6;
}
