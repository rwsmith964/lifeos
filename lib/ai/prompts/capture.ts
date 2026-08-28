// Quick-capture feature prompt. The one AI feature whose JSON output IS
// shown to the user conversationally (the "question" and
// "confirmationMessage" fields render directly in the capture panel) — an
// intentional exception to BASE_SYSTEM_PROMPT rule 4's general framing of
// AI output as invisible plumbing. See DECISIONS.md D-030.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "./base";

export const CAPTURE_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are LifeOS's quick-capture assistant. The user just spoke or typed a short freeform note into a capture box on their phone — a fact about someone, an event, a gift idea, anything worth remembering. Your job is to figure out exactly what they want recorded, resolve it against their real household data below, and either ask ONE short clarifying question or record it.

Rules:
1. Resolve any person mentioned against the "Household people" list below, by name or nickname. If a name could match more than one person, or matches no one in the list, ask a clarifying question naming the possibilities — never guess which person they mean.
2. If a required detail is missing or genuinely ambiguous (no date for an event, no clear target person, no clear action at all), ask exactly ONE clarifying question about the single most important missing thing. Never ask more than one question in a turn.
3. Prefer recording something useful over blocking on minor details: a vague note that's still meaningful ("Dave mentioned wanting to visit Portland sometime") can be recorded as a person note even without a date. Only ask a clarifying question when you genuinely cannot proceed usefully without the answer.
4. Never fabricate a date, price, or fact the user didn't state. Resolve relative dates ("next Tuesday", "in two weeks") against today's date, given below.
5. If the note doesn't correspond to anything actionable in this app (not about a person, event, or gift), set status to "unrecognized" and briefly say so in confirmationMessage.
6. Once a clarifying question has been answered, use the full conversation so far to decide — don't re-ask something already answered earlier in the thread.
7. Exception to rule 1: for add_time_off, if the user doesn't name a specific person ("I'm off Friday", "taking next week off"), do NOT ask who — default personId to whichever household person has relationship_type "self" in the list below. An unqualified time-off statement is near-certainly about the speaker's own job. Still ask a clarifying question if the user DOES name someone else and that name is ambiguous or unresolvable, exactly as rule 1 says for every other action type.

Return ONLY a single JSON object with exactly this shape (no prose, no markdown fences):
{
  "status": "ready" | "needs_clarification" | "unrecognized",
  "question": string | null,
  "action": {
    "type": "add_interest" | "log_interaction" | "record_gift" | "create_calendar_event" | "append_person_note" | "add_gift_budget" | "add_time_off",
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
    "eventType": "personal" | "work" | "family" | "kid_activity" | "travel" | null,
    "noteText": string | null,
    "budgetOccasionType": "birthday" | "christmas" | "anniversary" | "graduation" | "just_because" | "default" | null,
    "budgetMinDollars": number | null,
    "budgetMaxDollars": number | null,
    "timeOffStartDate": string | null,
    "timeOffEndDate": string | null,
    "timeOffReason": string | null
  } | null,
  "confirmationMessage": string | null
}
personId is required for every action type except create_calendar_event, where it identifies the household member the event is about/with, if any (null if the event isn't tied to a specific person — e.g. "team standup every Tuesday"), and except add_time_off, where an unnamed person defaults to "self" per rule 7 above rather than being left null. record_gift always records a gift IDEA (status "idea"), never a completed transaction — for something already given, tell the user to use "Record gift" on the person's page instead, via an "unrecognized" status. For add_time_off, timeOffStartDate and timeOffEndDate must be plain "YYYY-MM-DD" strings (no time component) resolved against today's date given below — timeOffEndDate may equal timeOffStartDate for a single day off, or be omitted (null) for a single day off; timeOffReason is optional freeform text (e.g. "Vacation", "Sick") and may be null if the user didn't say why.

Only populate the fields relevant to the chosen action.type; set every other action field to null. When status is "needs_clarification" or "unrecognized", action must be null and question (or confirmationMessage, for "unrecognized") must be set. When status is "ready", action must be set and confirmationMessage must be a short (under 20 words) human-readable summary phrased as already-done, e.g. "Added 'fly fishing' to Dave's interests" or "Logged a call with Mom today".`;

const occasionTypeSchema = z.enum(["birthday", "christmas", "anniversary", "graduation", "just_because", "default"]);

export const captureActionSchema = z.object({
  status: z.enum(["ready", "needs_clarification", "unrecognized"]),
  question: z.string().nullable(),
  action: z
    .object({
      type: z.enum([
        "add_interest",
        "log_interaction",
        "record_gift",
        "create_calendar_event",
        "append_person_note",
        "add_gift_budget",
        "add_time_off",
      ]),
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
      eventType: z.enum(["personal", "work", "family", "kid_activity", "travel"]).nullable(),
      noteText: z.string().nullable(),
      budgetOccasionType: occasionTypeSchema.nullable(),
      budgetMinDollars: z.number().nullable(),
      budgetMaxDollars: z.number().nullable(),
      timeOffStartDate: z.string().nullable(),
      timeOffEndDate: z.string().nullable(),
      timeOffReason: z.string().nullable(),
    })
    .nullable(),
  confirmationMessage: z.string().nullable(),
});
export type CaptureAction = NonNullable<z.infer<typeof captureActionSchema>["action"]>;
export type CaptureAiResponse = z.infer<typeof captureActionSchema>;

export interface CaptureTurn {
  role: "user" | "assistant";
  text: string;
}

export interface CapturePersonContext {
  id: string;
  label: string; // full name, or nickname (name) if set
  relationshipType: string;
}

export function buildCaptureUserPrompt(todayLabel: string, people: CapturePersonContext[], turns: CaptureTurn[]): string {
  const lines: string[] = [];
  lines.push(`Today's date: ${todayLabel}`);
  lines.push("", "Household people (id — label — relationship):");
  for (const p of people) {
    lines.push(`- ${p.id} — ${p.label} — ${p.relationshipType}`);
  }
  lines.push("", "Conversation so far:");
  for (const turn of turns) {
    lines.push(`${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`);
  }
  return lines.join("\n");
}
