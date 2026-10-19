// Redesign (docs/redesign-brief.md Part 2 — Today): transforms the
// existing brief content (already fully computed by lib/brief/generate.ts
// and the Module 8 contributor pipeline — no new business logic here,
// pure presentation) into one ranked stack of actionable items. Part 7:
// "A card without an action does not belong on this page" — every item
// this produces carries a real primaryAction with a real href; nothing
// here invents a capability (e.g. real SMS sending) the app doesn't have.
//
// Audit pass (2026-09-11), B1-B4: `id` is now a STABLE key (person id /
// opportunity id / household-item id, not an array index) so Dismiss/Snooze
// (B2) can persist against the same logical item across brief
// regenerations. B3/B4 reshape what each reach-out card actually says (the
// eyebrow used to repeat the whole "9 days since last contact..." sentence
// twice -- once as `metadata`, once folded into `headline`) and replace the
// old dual REACH_OUT/DECIDE/QUICK + Suggestion/Gifts/Household label pair
// with a single `source` axis (People/Plan/Gifts/Household/Calendar),
// which is also what predicts each card's primary action.
import type { BriefContent } from "./schema";
import type { ContactCadenceRow, PersonRow } from "../db/database.types";
import { evaluateCadence } from "../contact/cadence";

export type PriorityItemKind = "reach_out" | "decide" | "quick_headsup" | "quick_household" | "quick_household_dinner";

export interface PriorityAction {
  label: string;
  href: string;
}

export interface PriorityItem {
  /** Stable across brief regenerations for the same underlying thing -- also the Dismiss/Snooze key (B2). */
  id: string;
  kind: PriorityItemKind;
  /** The one categorical badge shown on the card (B4) -- People/Plan/Gifts/Household/Calendar. */
  source: string;
  /** A short qualifier shown beside the source badge (B3) -- "9 days", "This weekend", or "" when nothing short applies. */
  metadata: string;
  headline: string;
  detail?: string;
  primaryAction: PriorityAction;
  ghostActions: PriorityAction[];
  /** Lower sorts first -- reach-out items are the most urgent by design (Part 2's own mobile
   * reference leads with "Two people are slipping" before anything else). */
  rank: number;
  /** Set only for reach_out items with a resolvable person record -- lets the card render real inline actions (Log contact, Text) instead of just a link. */
  personId?: string;
  phone?: string | null;
  /** Set only for decide items backed by a real opportunities row -- lets the card render real Accept/Dismiss actions instead of just a link. */
  opportunityId?: string;
}

export interface BuildPriorityItemsParams {
  content: BriefContent;
  householdPeopleByName: Map<string, PersonRow>;
  opportunities: { id: string; headline: string; reasoning: string }[];
  household: { id: string; title: string; detail?: string; href?: string }[];
  /** B2: item ids currently hidden (dismissed/snoozed) for this viewer -- filtered out before returning. */
  dismissedItemIds?: Set<string>;
  /**
   * The brief's `people` list is frozen when the day's brief was generated,
   * so on its own a reach-out tile would keep showing "overdue" after you
   * logged the contact. With live cadences + today, a tile whose person is
   * no longer overdue right now drops out immediately -- no dismissals
   * table (which needs a migration) involved.
   */
  liveCadencesByPersonId?: Map<string, Pick<ContactCadenceRow, "target_interval_days" | "last_contact_date">>;
  today?: Date;
}

/** e.g. "Jackie Smith" -> "Jackie", so button labels read "Text Jackie" not "Text Jackie Smith". */
function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName;
}

// B3: the AI prompt (lib/ai/prompts/*) already requires every reach-out
// reason to lead with a concrete day count ("9 days since last contact...")
// -- pulling that same leading number out gives a short eyebrow qualifier
// ("9 days") instead of repeating the whole sentence in both the eyebrow
// and the headline underneath it.
function extractDayCount(reason: string): string {
  const match = reason.match(/^(\d+)\s+days?\b/i);
  return match ? `${match[1]} day${match[1] === "1" ? "" : "s"}` : "Overdue";
}

// A short, stable, non-cryptographic string hash (djb2) -- headsUp items
// are freeform AI text with no id of their own in the schema; hashing the
// title+detail gives a key stable enough for same-day Dismiss/Snooze
// (B2) to work without a schema change to lib/brief/schema.ts.
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

// D-02: `briefHeadsUpItemSchema` (lib/brief/schema.ts) only carries a
// title/detail -- the AI-generated brief content has no structured
// "what is this about" field for a heads-up item -- so every one of them
// used to be hardcoded to "Gifts"/"Open Gifts" (the category headsUp was
// originally built for, before weather/trail-condition items started
// landing in the same array). A weather/weekend-plan heads-up ("Weekend
// weather: showers... Magpie Cafe scores highest at 57/100") was rendering
// under a Gifts tag with a button that opened /gifts. Rather than change
// the AI schema/prompt contract (a bigger, riskier change than this pass
// scopes), this infers the real category from the item's own text -- every
// real example seen in production (gift order-by reminders, trail/weather/
// activity heads-ups) has an unambiguous keyword footprint.
interface HeadsUpCategory {
  metadata: string;
  actionLabel: string;
  href: string;
}
const HEADSUP_CATEGORY_RULES: { pattern: RegExp; category: HeadsUpCategory }[] = [
  {
    pattern: /\bgift(s|ed|ing)?\b|\border[- ]by\b|\bbirthday\b|\bshortlist\b/i,
    category: { metadata: "Gifts", actionLabel: "Open Gifts", href: "/gifts" },
  },
  {
    pattern: /\btrail\b|\bweather\b|\bhik(e|ing)\b|\bfish(ing)?\b|\bweekend\b|\bcondition(s)?\b|\btide\b|\bsolunar\b|\bactivit(y|ies)\b/i,
    category: { metadata: "Plan", actionLabel: "See weekend options", href: "/activities" },
  },
  {
    pattern: /\bcustody\b|\bchildcare\b|\bpickup\b|\bdrop[- ]off\b|\btransfer\b/i,
    category: { metadata: "Calendar", actionLabel: "Open Calendar", href: "/calendar" },
  },
];
// H1: name the destination instead of a bare "Open" -- the one case left
// after the other categories above already do this (Open Gifts/Calendar,
// "See weekend options").
const HEADSUP_DEFAULT_CATEGORY: HeadsUpCategory = { metadata: "Household", actionLabel: "Open Household", href: "/household" };

function categorizeHeadsUpItem(item: { title: string; detail: string }): HeadsUpCategory {
  const text = `${item.title} ${item.detail}`;
  for (const rule of HEADSUP_CATEGORY_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return HEADSUP_DEFAULT_CATEGORY;
}

const OPPORTUNITY_ID_PREFIX = "opportunities:";

export function buildTodayPriorityItems({
  content,
  householdPeopleByName,
  opportunities,
  household,
  dismissedItemIds,
  liveCadencesByPersonId,
  today,
}: BuildPriorityItemsParams): PriorityItem[] {
  const items: PriorityItem[] = [];

  // Reach out -- overdue relationships, most urgent (rank 0).
  content.people.forEach((person, i) => {
    const record = householdPeopleByName.get(person.personLabel);
    const liveCadence = record && liveCadencesByPersonId ? liveCadencesByPersonId.get(record.id) : undefined;
    if (liveCadence && today && !evaluateCadence(liveCadence, today).isOverdue) return;
    const id = record ? `reach-out:${record.id}` : `reach-out:unresolved-${i}`;
    const name = firstName(person.personLabel);
    // Everyone who needs a reach-out gets the same shape of action: with a
    // number on file, Text (and a Call button, see ReachOutCardActions);
    // without one, a direct route to adding it -- not a vague "Open" that
    // made two identical-looking tiles behave differently for no visible
    // reason.
    const primaryAction: PriorityAction = record?.phone
      ? { label: `Text ${name}`, href: `sms:${record.phone}` }
      : record
        ? { label: `Add ${name}'s number`, href: `/people/${record.id}/edit` }
        : { label: "Find in People", href: "/people" };
    items.push({
      id,
      kind: "reach_out",
      source: "People",
      metadata: extractDayCount(person.reason),
      // B3: was `${person.personLabel} — ${person.reason}`, repeating the
      // exact sentence already shown as metadata above it. The name alone
      // is the headline now; the full reason still shows, just once, as
      // the card's detail line.
      headline: person.personLabel,
      detail: person.reason,
      primaryAction,
      ghostActions: record ? [{ label: "Start gift", href: `/gifts` }] : [],
      rank: 0,
      personId: record?.id,
      phone: record?.phone ?? null,
    });
  });

  // Decide -- weather/activity/weekend-plan judgement calls.
  opportunities.forEach((opp) => {
    const opportunityId = opp.id.startsWith(OPPORTUNITY_ID_PREFIX) ? opp.id.slice(OPPORTUNITY_ID_PREFIX.length) : opp.id;
    items.push({
      id: `decide:${opportunityId}`,
      kind: "decide",
      source: "Plan",
      metadata: "This weekend",
      headline: opp.headline,
      detail: opp.reasoning,
      primaryAction: { label: "Open Plan", href: "/activities" },
      ghostActions: [],
      rank: 1,
      opportunityId,
    });
  });
  if (content.suggestion && opportunities.length === 0) {
    items.push({
      id: "decide:suggestion",
      kind: "decide",
      source: "Plan",
      metadata: "This weekend",
      headline: content.suggestion.title,
      detail: content.suggestion.detail,
      primaryAction: { label: "Open Plan", href: "/activities" },
      ghostActions: [],
      rank: 1,
    });
  }

  // Quick -- gift deadlines, weekend/weather heads-ups, and household
  // chores/meal gaps, all sharing this one AI-generated array with no
  // structured category of its own. categorizeHeadsUpItem infers which of
  // those this particular item actually is; its `metadata` field is
  // already a source name (Gifts/Plan/Calendar/Household), reused directly
  // as this item's one badge label.
  content.headsUp.forEach((item) => {
    const category = categorizeHeadsUpItem(item);
    items.push({
      id: `quick-headsup:${stableHash(`${item.title}|${item.detail}`)}`,
      kind: "quick_headsup",
      source: category.metadata,
      metadata: "",
      headline: item.title,
      detail: item.detail,
      primaryAction: { label: category.actionLabel, href: category.href },
      ghostActions: [],
      rank: 2,
    });
  });
  household.forEach((item) => {
    // B1: "household:dinner-gap" (lib/brief/contributors/household.ts) is
    // the one household item with a real inline action available (a meal
    // picker) -- everything else household-shaped stays a plain link.
    const isDinnerGap = item.id === "household:dinner-gap";
    items.push({
      id: `quick-household:${item.id}`,
      kind: isDinnerGap ? "quick_household_dinner" : "quick_household",
      source: "Household",
      metadata: "",
      headline: item.title,
      detail: item.detail,
      // H1: name the destination instead of a bare "Open".
      primaryAction: { label: "Open Household", href: item.href ?? "/household" },
      ghostActions: [],
      rank: 2,
    });
  });

  const visible = dismissedItemIds ? items.filter((item) => !dismissedItemIds.has(item.id)) : items;
  return visible.sort((a, b) => a.rank - b.rank);
}
