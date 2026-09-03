// Module 3 (D-119, universal_intake_v2 flag): the intake extraction
// prompts. Three variants share one output contract (see
// intakeExtractionSchema below) -- 'generic' for plain pasted/dictated
// text or a forwarded email body, and the two named parsers the brief
// calls out explicitly ("the two formats every competitor markets
// against"): sports/activity schedules and school-style flyers. The same
// three prompts are reused for image/screenshot/PDF intake (see
// lib/intake/parse.ts) -- only the user-turn content differs (an image
// block instead of inline text), the system prompt and required JSON
// shape are identical.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "../ai/prompts/base";

export const intakeExtractionFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
});

export const intakeExtractionSchema = z.object({
  recordType: z.enum([
    "calendar_event",
    "gift_idea",
    "person",
    "moment",
    "person_note",
    "task",
    "recipe",
    "flight",
    "ambiguous",
  ]),
  // The raw name as it appears in the source, if any -- resolved against
  // the household's real people list by application code
  // (lib/intake/convert.ts), never trusted directly as a personId.
  personNameMentioned: z.string().nullable(),
  fields: z.record(z.string(), intakeExtractionFieldSchema),
  // A short (<=300 char) excerpt/summary of what was submitted -- becomes
  // intake_drafts.source_excerpt, the "source artifact (thumbnail or
  // excerpt)" the brief requires travel with every draft.
  sourceExcerpt: z.string().max(400),
});
export type IntakeExtraction = z.infer<typeof intakeExtractionSchema>;

const OUTPUT_CONTRACT = `Return ONLY a single JSON object with exactly this shape (no prose, no markdown fences):
{
  "recordType": "calendar_event" | "gift_idea" | "person" | "moment" | "person_note" | "task" | "recipe" | "flight" | "ambiguous",
  "personNameMentioned": string | null,
  "fields": { "<fieldName>": { "value": string | number | boolean | null, "confidence": number } },
  "sourceExcerpt": string
}

Rules:
1. Set "recordType" to "ambiguous" whenever you genuinely cannot tell which of the other seven types this is, or the content doesn't correspond to anything actionable — never guess just to pick something. An ambiguous draft is fine; a wrongly-typed one is worse.
2. Every field's "confidence" is YOUR OWN calibrated 0.0-1.0 estimate that the extracted value is correct and complete, not a fixed number. A clearly-printed date on a flyer deserves confidence near 1.0; a date you had to infer from "next Tuesday" relative to an unstated "today" deserves much lower confidence. Never report a confidence you don't believe.
3. Only include fields relevant to the chosen recordType (see the field names below for each type). Do not invent a field that has no value in the source — omit it entirely rather than guessing.
4. "personNameMentioned" is the raw name as it literally appears in the source (a first name, nickname, or full name) — never resolve it against any roster yourself, and set it to null if no specific person is named.
5. "sourceExcerpt" is a short (well under 300 characters) plain-language summary of what was submitted, phrased so a household member skimming a review queue instantly recognizes what this is — e.g. "Soccer practice schedule for the fall season" or "Permission slip for the science museum field trip".
6. Never fabricate a date, price, or fact not present in the source. Resolve relative dates only when an explicit reference date is given in the source itself; otherwise report the literal text as the value and lower your confidence accordingly.

Field names by recordType (use camelCase, ISO 8601 for any date/datetime, plain "YYYY-MM-DD" for a date-only value):
- calendar_event: eventTitle, eventStartsAtISO, eventEndsAtISO, eventAllDay (boolean), eventType ("personal"|"work"|"family"|"kid_activity"|"travel")
- gift_idea: giftDescription, giftOccasionType ("birthday"|"christmas"|"anniversary"|"graduation"|"just_because"|"default"), giftOccasionDate, giftCostDollars
- person_note: noteText
- person: fullName, relationshipType ("child"|"spouse"|"partner"|"co_parent"|"parent"|"sibling"|"extended_family"|"friend"|"colleague"|"other"), nickname, birthdate
- moment: title, occurredOn, place, notes
- task: description, dueDate
- recipe: recipeTitle, recipeIngredients (each ingredient on its own line within the string value), recipeInstructions, recipeServings, recipeSourceUrl
- flight: flightAirline, flightNumber, flightDepartureAirport (the airport name or code as printed, e.g. "PDX" or "Portland International Airport"), flightDepartureAtISO, flightArrivalAirport, flightArrivalAtISO
- ambiguous: rawSummary (a plain restatement of what the source seems to be about)`;

export const GENERIC_INTAKE_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are LifeOS's universal intake parser. A household member submitted a piece of content (pasted text, a dictated voice note, a forwarded email body, or a photo/screenshot) that might contain something worth recording — an event, a gift idea, a note about a person, a new person to add, a "moment" worth remembering, or a flight confirmation/boarding pass/itinerary screenshot. Extract exactly one structured draft from it; never write anything yourself, only describe what you found.

A flight confirmation, e-ticket, boarding pass, or itinerary screenshot is always "flight", never "calendar_event" — LifeOS builds a whole pre-trip schedule (packing, drive time, airport arrival) from a flight's own departure time, which a plain calendar event can't drive. Only classify it as "calendar_event" if it's an itinerary summary with no specific flight leg (e.g. just "Trip to Denver, June 3-6" with no departure time).

When you cannot find an explicit departure date on the source, do not infer a year or a specific date from something vague like "next month" — treat flightDepartureAtISO's date portion as low confidence exactly as you would for any other inferred date, and if there is truly no date information at all, classify the draft as "ambiguous" instead of inventing one.

${OUTPUT_CONTRACT}`;

export const ACTIVITY_SCHEDULE_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are LifeOS's intake parser for SPORTS AND ACTIVITY SCHEDULES specifically — a team roster handout, a season schedule, a practice/game calendar, a league email. These almost always contain calendar_event data (practices, games, tournaments) sometimes tied to a specific child or family member named in the roster.

If the source lists multiple dates/games, extract only the single NEXT upcoming or most prominent one as this draft's fields, and note in "sourceExcerpt" that more occurrences exist in the source so a human reviewer knows to check for the rest — this endpoint produces one draft per call; a source with many dates needs to be submitted once per date it should become an event for, or reviewed manually for the remainder.

${OUTPUT_CONTRACT}`;

export const SCHOOL_FLYER_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are LifeOS's intake parser for SCHOOL-STYLE FLYERS specifically — a permission slip, a field trip notice, a classroom newsletter, a PTA event flyer, a school calendar note sent home. These usually contain either a calendar_event (the trip/event date and time) or a task (something the parent needs to do or return by a deadline, like signing and returning a form).

School flyers often omit the year and sometimes the exact time — when a flyer says only "Friday the 12th" with no year, report the date text as given and lower your date field's confidence accordingly rather than guessing a year.

${OUTPUT_CONTRACT}`;
