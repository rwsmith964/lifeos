// Redesign (docs/redesign-brief.md Part 2 — Today): transforms the
// existing brief content (already fully computed by lib/brief/generate.ts
// and the Module 8 contributor pipeline — no new business logic here,
// pure presentation) into one ranked stack of actionable items. Part 7:
// "A card without an action does not belong on this page" — every item
// this produces carries a real primaryAction with a real href; nothing
// here invents a capability (e.g. real SMS sending) the app doesn't have.
import type { BriefContent } from "./schema";
import type { PersonRow } from "../db/database.types";

export type PriorityTag = "reach_out" | "decide" | "quick";

export interface PriorityAction {
  label: string;
  href: string;
}

export interface PriorityItem {
  id: string;
  tag: PriorityTag;
  metadata: string;
  headline: string;
  detail?: string;
  primaryAction: PriorityAction;
  ghostActions: PriorityAction[];
  /** Lower sorts first -- reach-out items are the most urgent by design (Part 2's own mobile
   * reference leads with "Two people are slipping" before anything else). */
  rank: number;
}

export interface BuildPriorityItemsParams {
  content: BriefContent;
  householdPeopleByName: Map<string, PersonRow>;
  opportunities: { id: string; headline: string; reasoning: string }[];
  household: { id: string; title: string; detail?: string; href?: string }[];
}

/** e.g. "Jackie Smith" -> "Jackie", so button labels read "Text Jackie" not "Text Jackie Smith". */
function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName;
}

export function buildTodayPriorityItems({
  content,
  householdPeopleByName,
  opportunities,
  household,
}: BuildPriorityItemsParams): PriorityItem[] {
  const items: PriorityItem[] = [];

  // Reach out -- overdue relationships, most urgent (rank 0). One card per
  // person the brief already flagged; Part 3's Tag mapping ("Reach out"
  // = slipping).
  content.people.forEach((person, i) => {
    const record = householdPeopleByName.get(person.personLabel);
    const name = firstName(person.personLabel);
    const primaryAction: PriorityAction =
      record?.phone ? { label: `Text ${name}`, href: `sms:${record.phone}` } : { label: "Open", href: record ? `/people/${record.id}` : "/people" };
    items.push({
      id: `reach-out-${i}`,
      tag: "reach_out",
      metadata: person.reason,
      headline: `${person.personLabel} — ${person.reason}`,
      primaryAction,
      ghostActions: record ? [{ label: "Start gift", href: `/gifts` }] : [],
      rank: 0,
    });
  });

  // Decide -- weather/activity/weekend-plan judgement calls (Part 3: "Decide" = custody-you tint).
  opportunities.forEach((opp, i) => {
    items.push({
      id: `decide-${i}`,
      tag: "decide",
      metadata: "This weekend",
      headline: opp.headline,
      detail: opp.reasoning,
      primaryAction: { label: "Open Plan", href: "/activities" },
      ghostActions: [],
      rank: 1,
    });
  });
  if (content.suggestion && opportunities.length === 0) {
    items.push({
      id: "decide-suggestion",
      tag: "decide",
      metadata: "Suggestion",
      headline: content.suggestion.title,
      detail: content.suggestion.detail,
      primaryAction: { label: "Open Plan", href: "/activities" },
      ghostActions: [],
      rank: 1,
    });
  }

  // Quick -- gift deadlines and household chores/meal gaps (Part 3: "Quick" = neutral).
  content.headsUp.forEach((item, i) => {
    items.push({
      id: `quick-headsup-${i}`,
      tag: "quick",
      metadata: "Gifts",
      headline: item.title,
      detail: item.detail,
      primaryAction: { label: "Open Gifts", href: "/gifts" },
      ghostActions: [],
      rank: 2,
    });
  });
  household.forEach((item) => {
    items.push({
      id: `quick-household-${item.id}`,
      tag: "quick",
      metadata: "Household",
      headline: item.title,
      detail: item.detail,
      primaryAction: { label: "Open", href: item.href ?? "/household" },
      ghostActions: [],
      rank: 2,
    });
  });

  return items.sort((a, b) => a.rank - b.rank);
}
