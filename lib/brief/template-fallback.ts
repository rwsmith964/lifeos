// Non-AI templated brief (Section 11.3: "brief falls back to a non-AI
// templated version rather than failing" when AI is unavailable or the
// household is over its daily spend ceiling). Pure — builds the same
// BriefContent shape the AI would, directly from context, no reasoning.
import type { BriefContextInput } from "../ai/prompts/brief";
import type { BriefContent } from "./schema";

export function buildTemplatedBriefContent(ctx: BriefContextInput): BriefContent {
  const today = ctx.events
    .filter((e) => !e.isTomorrow)
    .map((e) => ({ time: e.time, title: e.title, note: e.travelNote }));

  const headsUp = [
    ...ctx.giftReminders.map((g) => ({
      title: `Order by ${g.orderByDate}`,
      detail: `${g.personLabel}'s ${g.occasionType} gift needs to ship — ${g.daysUntilOrderBy} days left.`,
    })),
    ...ctx.prepObligations.map((p) => ({
      title: `Prep: ${p.activityTitle}`,
      detail: `Get ready by ${p.prepAtLabel} for tomorrow.`,
    })),
  ];

  const people = ctx.overdueContacts.map((c) => ({
    personLabel: c.personLabel,
    reason:
      c.daysSinceLastContact == null
        ? "no contact on record yet"
        : `${c.daysSinceLastContact} days since last contact`,
  }));

  const hasNothingNotable = today.length === 0 && headsUp.length === 0 && people.length === 0;

  return {
    headline: hasNothingNotable ? "Nothing notable today." : "Here's what's on deck today.",
    today,
    headsUp,
    people,
    suggestion: null,
    weather: ctx.weather,
  };
}
