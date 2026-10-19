import type { BriefContent } from "./schema";

// B6 (audit pass 2026-09-11): "Rename to 'Refresh briefing'... Afterwards,
// show what changed -- 'Updated: weather, 2 reach-outs'." A plain,
// human-readable summary of which top-level sections actually differ
// between the brief content before and after a regenerate, not a deep
// field-by-field diff -- the AI regenerates prose fresh every time, so
// "does this section's information look different" (weather summary
// changed, headline changed, item counts changed) is the meaningful
// signal a person actually wants, not a text diff of paragraphs.
export function summarizeBriefChanges(before: BriefContent | null, after: BriefContent): string | null {
  if (!before) return null;

  const changed: string[] = [];

  if (before.weather?.summary !== after.weather?.summary) changed.push("weather");

  const peopleChanged =
    after.people.length !== before.people.length || before.people.some((p, i) => p.reason !== after.people[i]?.reason);
  if (peopleChanged) changed.push(after.people.length === 1 ? "1 reach-out" : `${after.people.length} reach-outs`);

  if (before.headsUp.length !== after.headsUp.length) {
    changed.push(after.headsUp.length === 1 ? "1 heads-up item" : `${after.headsUp.length} heads-up items`);
  }

  if (before.today.length !== after.today.length) changed.push("today's schedule");

  if (changed.length === 0) return "Nothing changed.";
  return `Updated: ${changed.join(", ")}.`;
}
