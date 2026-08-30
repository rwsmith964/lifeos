// Custody agreement parsing prompt (D-075, best-effort per user request:
// "would be nice to have a feature ... upload custody agreements and have
// the AI reading pool and then filled out the calendar and then you verify
// that it is correct before continuing"). Scope is deliberately narrow: it
// maps the agreement's text to the Weekly (day-by-day) builder's data shape
// — one weekday-recurring pattern, dayIndex 0 (Sunday) through 6 (Saturday)
// — the same model new-schedule-form.tsx's Weekly mode already uses. This
// is a best-effort approximation, not a general parser for every possible
// custody arrangement:
//  - Agreements that repeat weekly (the common case, e.g. "every Friday
//    4:30pm to Monday 8:30am") map cleanly and exactly.
//  - Agreements on a longer cycle (alternating weeks, 2-2-3, 2-2-5-5,
//    holiday-specific carve-outs) do NOT fit the 7-day Weekly model. Rather
//    than fail outright, the model does its best single-week approximation
//    and MUST list the mismatch under `unresolved` so the review UI warns
//    the user to double check it (and use the Advanced custom-cycle builder
//    instead if a true multi-week cycle is needed) — never silently produce
//    a confident-looking but wrong weekly pattern for a non-weekly
//    agreement.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "./base";

export interface CustodyAgreementRosterPerson {
  id: string;
  label: string;
  relationshipType: string;
}

export const CUSTODY_AGREEMENT_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are LifeOS's custody-agreement parser. The user pasted the text of a real custody agreement (or a plain-English description of their arrangement). Your job is to map it onto a SINGLE REPEATING 7-DAY WEEK pattern: for each weekday (Sunday=0 through Saturday=6), who has the child/children starting that day, and — only where the agreement explicitly states a specific handover clock time for a day that differs from the schedule's overall default — that day's override time.

Rules:
1. Resolve every parent/guardian named in the agreement against the "Household adults" list below by name, nickname, or role (e.g. "Mother", "Father", "Mom", "Dad"). Set a person's id in weeklyAssignments only when you're confident of the match; if a day's responsible person can't be confidently resolved, leave that day's value null rather than guessing.
2. weeklyAssignments must have exactly 7 entries, keyed "0" through "6" (Sunday through Saturday), value = a personId from the roster or null if unresolved for that day.
3. A "handover" is the moment custody passes from one parent to the other — this happens at the START of the day the OTHER parent's custody begins. Only add an entry to weeklyHandoverOverrides for a day where the agreement states a SPECIFIC clock time for that day's handover that differs from the schedule's single overall default time. Leave days with no explicitly stated distinct time out of this object entirely — they'll use defaultHandoverTime.
4. defaultHandoverTime is the ONE time that applies to every handover the agreement doesn't call out a different time for (e.g. if the agreement only ever mentions "4:30pm" and "8:30am" for two specific transitions and never states any other time, pick whichever of those you're most confident is the general default, or your best reasonable estimate, and put the other one(s) in weeklyHandoverOverrides). All times must be 24-hour "HH:MM".
5. childPersonIds: list every child from the "Household children" roster below that this agreement appears to cover, by resolving names mentioned in the text. If the agreement never names specific children (common — many agreements just say "the children" or "the minor child"), include ALL children from the roster, since the arrangement plainly covers whichever children exist in this household's custody agreement.
6. handoverLocation: a short string if the agreement states a specific handover location/method (e.g. "at the children's school", "curbside at Mother's residence"), otherwise null. Never invent one.
7. confidence: "high" if the agreement describes a clean single-week repeating pattern with clear times; "medium" if you had to make reasonable inferences (e.g. an implied default time, an ambiguous name); "low" if the agreement describes something structurally different from a single repeating week (alternating weeks, a rotating multi-week cycle, holiday-specific schedules) and this weekly approximation only captures the "regular" week, not the full arrangement.
8. unresolved: an array of short plain-English strings, each flagging one specific thing the user should double-check before saving — e.g. "Couldn't confidently match 'the other parent' to a household member for Wednesday", "This agreement describes an alternating two-week pattern; only the first week's pattern is shown below — use the Advanced cycle builder for the full two-week rotation", "No handover location was stated". Return an empty array only if there is truly nothing to flag.
9. summary: one or two plain-English sentences recapping the pattern you detected, written for a parent to quickly sanity-check (e.g. "Looks like Richard has the kids Friday evening through Monday morning, and Melissa has them the rest of the week. Handover is 4:30pm Fridays and 8:30am Mondays.").
10. Never fabricate a person, day, or time that isn't supported by the text. If the whole document is unrelated to a custody schedule, or too vague to extract anything, set every weeklyAssignments value to null, confidence to "low", and explain why in summary and unresolved.

Return ONLY a single JSON object with exactly this shape (no prose, no markdown fences):
{
  "weeklyAssignments": { "0": string | null, "1": string | null, "2": string | null, "3": string | null, "4": string | null, "5": string | null, "6": string | null },
  "weeklyHandoverOverrides": { [dayIndex: string]: string },
  "defaultHandoverTime": string,
  "handoverLocation": string | null,
  "childPersonIds": string[],
  "confidence": "high" | "medium" | "low",
  "unresolved": string[],
  "summary": string
}`;

export function buildCustodyAgreementUserPrompt(
  agreementText: string,
  adults: CustodyAgreementRosterPerson[],
  children: CustodyAgreementRosterPerson[]
): string {
  const adultLines = adults.map((p) => `- ${p.label} (id: ${p.id}, relationship: ${p.relationshipType})`).join("\n") || "(none on file)";
  const childLines = children.map((p) => `- ${p.label} (id: ${p.id})`).join("\n") || "(none on file)";
  return `Household adults (potential custody parties):\n${adultLines}\n\nHousehold children:\n${childLines}\n\nCustody agreement text pasted by the user:\n"""\n${agreementText}\n"""`;
}

const dayIndexKeySchema = z.enum(["0", "1", "2", "3", "4", "5", "6"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM 24-hour time");

export const custodyAgreementResponseSchema = z.object({
  weeklyAssignments: z.record(dayIndexKeySchema, z.string().nullable()),
  weeklyHandoverOverrides: z.record(z.string(), timeSchema).default({}),
  defaultHandoverTime: timeSchema,
  handoverLocation: z.string().nullable(),
  childPersonIds: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"]),
  unresolved: z.array(z.string()).default([]),
  summary: z.string(),
});

export type CustodyAgreementParseResult = z.infer<typeof custodyAgreementResponseSchema>;
