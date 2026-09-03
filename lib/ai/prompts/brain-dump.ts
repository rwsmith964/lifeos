// Brain-dump feature prompt (D-066). The user records or types one long,
// rambling freeform note — voice-dictated via the same Web Speech API
// pattern as Quick Capture (components/capture/capture-button.tsx, D-048)
// but with no back-and-forth: it's a single one-shot transcript, not a
// conversation. Unlike Quick Capture (one action per turn, clarifying
// questions allowed), this prompt must pull out ZERO OR MORE candidate
// actions from a single transcript and never block on asking a question —
// there is no conversational turn to answer one. Ambiguity is instead
// surfaced to the user via an approve/edit review UI: the model does its
// best guess and leaves a field null when genuinely unresolvable, and the
// UI requires the human to fill/fix it before saving that item.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "./base";

export const BRAIN_DUMP_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are LifeOS's brain-dump assistant. The user just spoke or typed one long, unstructured note covering possibly several unrelated things at once — thoughts about people, events to add, gift ideas, notes to remember, time off, anything worth recording. Your job is to split it into a list of distinct, individually actionable items and resolve each one against their real household data below. There is no follow-up turn available, so never ask a question — do your best on every item and leave a field null when you genuinely cannot determine it.

Rules:
1. Split the transcript into distinct items — one item per distinct actionable fact, regardless of whether the transcript uses separate sentences, a semicolon, or joins them in one sentence with "and"/"also"/"plus"/"also remind me to". Two facts joined by a conjunction are still two separate items unless they genuinely describe the same single action (e.g. "log a call with Mom, she says she's excited about the trip" is ONE log_interaction item with that detail folded into interactionNotes, since both halves are about the same phone call). Do not merge unrelated facts into one item, and do not split one coherent thought into several. Example: "Em wants a bike for her birthday and also remind me to call the dentist tomorrow" is TWO items — a record_gift for Em's bike, and a create_calendar_event for calling the dentist tomorrow — never collapse this into one item or drop the second clause.
2. For each item, resolve any person mentioned against the "Household people" list below, by name or nickname. If a name clearly matches exactly one person, set personId to that id. If it matches no one, is ambiguous between multiple people, or no person was named at all, set personId to null — never guess. The review UI lets the user pick the right person before saving.
3. Exception to rule 2: for add_time_off, if the user doesn't name a specific person ("I'm off Friday", "taking next week off"), leave personId null — the app attributes it to the device's own user automatically, which you cannot determine from the household list (more than one household person can have relationship_type "self"). Only set personId for add_time_off if another specific household member is named.
4. Never fabricate a date, price, or fact the user didn't state. Resolve relative dates ("next Tuesday", "in two weeks") against today's date, given below.
5. If part of the transcript doesn't correspond to anything actionable in this app (not about a person, event, gift, or a reminder to do something on a particular day — e.g. a passing thought with no date attached, a to-do unrelated to this app, or filler), simply omit it from the items array. Don't force everything into an action. Important: a "remind me to <do X>" phrase IS actionable whenever it carries any day/time signal ("tomorrow", "Friday", "next week") — capture it as create_calendar_event with eventTitle describing the task (e.g. "Call the dentist") and personId null unless a specific person is named; only omit a reminder that has no day/time signal at all and genuinely can't be placed on the calendar.
6. If nothing in the whole transcript is actionable, return an empty items array.
7. record_gift always records a gift IDEA (status "idea"), never a completed transaction — for something already given, that sentence isn't actionable for this feature; omit it (per rule 5).
8. Each item needs a short "summary" string (under 12 words, present tense, e.g. "Add 'fly fishing' to Dave's interests" or "Log a call with Mom today") describing what will happen if the item is saved as-is — written for a human scanning a review list, not a confirmation of something already done.
9. For create_calendar_event: if the transcript names a day but never states a specific time of day (no "7am", "at noon", "after work", etc.), set eventAllDay to true and give eventStartsAtISO that date at midnight (00:00:00) — never invent a time of day that was never said (P0-4: the review UI used to silently default missing times to a made-up clock time). Set eventAllDay to false whenever a specific time was stated.
10. For create_calendar_event: set eventDateApproximate to true when the date itself is a loose guess rather than something the transcript clearly pins down (e.g. "sometime next month", "in a few weeks", a season with no date) — the review UI flags this for the user to double-check. Set it to false when the date is stated explicitly (a specific date) or unambiguously resolvable (a clearly named weekday, "tomorrow", "next Friday").

Return ONLY a single JSON object with exactly this shape (no prose, no markdown fences):
{
  "items": [
    {
      "type": "add_interest" | "log_interaction" | "record_gift" | "create_calendar_event" | "append_person_note" | "add_gift_budget" | "add_time_off",
      "summary": string,
      "personId": string | null,
      "interest": string | null,
      "interestStrength": "casual" | "regular" | "passionate" | null,
      "interactionType": "call" | "text" | "in_person" | "activity" | "other" | null,
      "interactionNotes": string | null,
      "giftDescription": string | null,
      "giftOccasionType": "birthday" | "christmas" | "anniversary" | "graduation" | "just_because" | "default" | null,
      "giftOccasionDate": string | null,
      "giftCostDollars": number | null,
      "eventTitle": string | null,
      "eventStartsAtISO": string | null,
      "eventEndsAtISO": string | null,
      "eventAllDay": boolean | null,
      "eventDateApproximate": boolean | null,
      "eventType": "personal" | "work" | "family" | "kid_activity" | "travel" | null,
      "noteText": string | null,
      "budgetOccasionType": "birthday" | "christmas" | "anniversary" | "graduation" | "just_because" | "default" | null,
      "budgetMinDollars": number | null,
      "budgetMaxDollars": number | null,
      "timeOffStartDate": string | null,
      "timeOffEndDate": string | null,
      "timeOffReason": string | null,
      "timeOffDestination": string | null
    }
  ]
}
personId is required for every action type except create_calendar_event (null if the event isn't tied to a specific person — e.g. "team standup every Tuesday") and add_time_off (per rule 3). For add_time_off, timeOffStartDate and timeOffEndDate must be plain "YYYY-MM-DD" strings (no time component) resolved against today's date given below — timeOffEndDate may equal timeOffStartDate for a single day off, or be omitted (null) for a single day off; timeOffReason is optional freeform text and may be null. timeOffDestination is the specific place they're traveling to if one was stated (e.g. "Los Angeles", "my sister's in Denver") — extract it whenever a place is mentioned, even loosely, since this is what lets the rest of the app recognize a trip and plan around it; leave it null when no destination was said.

Only populate the fields relevant to the chosen item's type; set every other field to null.`;

const occasionTypeSchema = z.enum(["birthday", "christmas", "anniversary", "graduation", "just_because", "default"]);

export const brainDumpItemSchema = z.object({
  type: z.enum([
    "add_interest",
    "log_interaction",
    "record_gift",
    "create_calendar_event",
    "append_person_note",
    "add_gift_budget",
    "add_time_off",
  ]),
  summary: z.string(),
  personId: z.string().nullable(),
  interest: z.string().nullable(),
  interestStrength: z.enum(["casual", "regular", "passionate"]).nullable(),
  interactionType: z.enum(["call", "text", "in_person", "activity", "other"]).nullable(),
  interactionNotes: z.string().nullable(),
  giftDescription: z.string().nullable(),
  giftOccasionType: occasionTypeSchema.nullable(),
  giftOccasionDate: z.string().nullable(),
  giftCostDollars: z.number().nullable(),
  eventTitle: z.string().nullable(),
  eventStartsAtISO: z.string().nullable(),
  eventEndsAtISO: z.string().nullable(),
  // P0-4: lets the model say "no time was ever stated" (all-day) and "this
  // date is a loose guess" (approximate) instead of the review UI silently
  // defaulting to a fabricated time / presenting a guessed date as certain.
  eventAllDay: z.boolean().nullable(),
  eventDateApproximate: z.boolean().nullable(),
  eventType: z.enum(["personal", "work", "family", "kid_activity", "travel"]).nullable(),
  noteText: z.string().nullable(),
  budgetOccasionType: occasionTypeSchema.nullable(),
  budgetMinDollars: z.number().nullable(),
  budgetMaxDollars: z.number().nullable(),
  timeOffStartDate: z.string().nullable(),
  timeOffEndDate: z.string().nullable(),
  timeOffReason: z.string().nullable(),
  timeOffDestination: z.string().nullable(),
});

export const brainDumpResponseSchema = z.object({
  items: z.array(brainDumpItemSchema),
});

export type BrainDumpItem = z.infer<typeof brainDumpItemSchema>;
export type BrainDumpResponse = z.infer<typeof brainDumpResponseSchema>;

export interface BrainDumpPersonContext {
  id: string;
  label: string; // full name, or nickname (name) if set
  relationshipType: string;
}

export function buildBrainDumpUserPrompt(todayLabel: string, people: BrainDumpPersonContext[], transcript: string): string {
  const lines: string[] = [];
  lines.push(`Today's date: ${todayLabel}`);
  lines.push("", "Household people (id — label — relationship):");
  for (const p of people) {
    lines.push(`- ${p.id} — ${p.label} — ${p.relationshipType}`);
  }
  lines.push("", "Transcript:", transcript);
  return lines.join("\n");
}
