// "Add from a photo": the structured result of reading a photo or screenshot
// of an invitation. Deliberately separate from the generic intake draft
// (lib/intake/prompts.ts), which models one flat record -- an invitation
// carries a lot more that the follow-up questions depend on (what kind of
// occasion it is, who it's addressed to, registry details, the RSVP date).
// Nothing here writes anything; the reviewer confirms everything first.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "../ai/prompts/base";

export const INVITE_CATEGORIES = [
  "wedding",
  "bridal_shower",
  "baby_shower",
  "birthday",
  "graduation",
  "anniversary",
  "housewarming",
  "retirement",
  "holiday",
  "dinner",
  "party",
  "other",
] as const;
export type InviteCategory = (typeof INVITE_CATEGORIES)[number];

const nullableString = z.string().nullable().catch(null);
const nameList = z.array(z.string().trim().min(1)).catch([]);

export const inviteExtractionSchema = z.object({
  title: z.string().trim().min(1),
  category: z.enum(INVITE_CATEGORIES).catch("other"),
  /** "YYYY-MM-DD" -- null when the invitation doesn't give a date at all. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
  /** Local wall-clock "HH:mm" (24h), no timezone. */
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .catch(null),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .catch(null),
  location: nullableString,
  /** The people throwing it / being celebrated, as printed ("Emma & Jake"). */
  honoreeNames: nameList,
  hostNames: nameList,
  /** Everyone the invitation is addressed to, as printed ("The Smith Family", "Richard & guest"). */
  invitedNames: nameList,
  rsvpBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
  rsvpContact: nullableString,
  /** Registry / gift wording exactly as the invitation gives it, including store names. */
  registryInfo: nullableString,
  registryUrl: z.string().url().nullable().catch(null),
  dressCode: nullableString,
  notes: nullableString,
  /** True when the year had to be inferred rather than read off the invitation. */
  yearInferred: z.boolean().catch(false),
});
export type InviteExtraction = z.infer<typeof inviteExtractionSchema>;

export const INVITE_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are reading a photo or screenshot of an INVITATION (a wedding, shower, birthday party, graduation, dinner, etc.) for Famwise. Extract exactly what is printed so the person can confirm it before anything is added to their calendar. You never add anything yourself.

Return ONLY a single JSON object with exactly this shape (no prose, no markdown fences):
{
  "title": string,                       // short event name, e.g. "Emma & Jake's Wedding"
  "category": "wedding" | "bridal_shower" | "baby_shower" | "birthday" | "graduation" | "anniversary" | "housewarming" | "retirement" | "holiday" | "dinner" | "party" | "other",
  "date": "YYYY-MM-DD" | null,
  "startTime": "HH:mm" | null,           // 24-hour local time as printed; null if none printed
  "endTime": "HH:mm" | null,
  "location": string | null,             // venue name and address as printed
  "honoreeNames": string[],              // who is being celebrated (the couple, the birthday child, the graduate)
  "hostNames": string[],                 // who is hosting, if printed separately from the honorees
  "invitedNames": string[],              // every name the invitation is ADDRESSED to, exactly as printed
  "rsvpBy": "YYYY-MM-DD" | null,
  "rsvpContact": string | null,          // phone, email, or website to RSVP to
  "registryInfo": string | null,         // anything about gifts or a registry, as printed, including store names
  "registryUrl": string | null,          // a registry web address if one is printed in full
  "dressCode": string | null,
  "notes": string | null,                // anything else worth keeping (parking, kids welcome, ceremony vs reception times)
  "yearInferred": boolean
}

Rules:
1. Report only what is printed. If a field is not on the invitation use null (or [] for the name lists) -- never guess a time, address or name.
2. The user turn tells you today's date. When the invitation prints a date with no year, choose the next occurrence of that date on or after today and set "yearInferred" to true. Otherwise set it to false.
3. Split names into separate array entries ("Emma and Jake" becomes ["Emma", "Jake"]). Keep titles off ("Mr. and Mrs. Chen" stays as printed, because it can't be split into first names). "The Smith Family" stays as one entry.
4. If a ceremony and a reception have different times, use the first start time and describe the rest in "notes".
5. If a registry is mentioned, copy the wording into "registryInfo" so the person can use it later; if the invitation says no gifts, put that in "registryInfo" as printed.`;

export function buildInviteUserPrompt(todayIso: string): string {
  return `Today's date is ${todayIso}. Read the attached invitation per your instructions.`;
}
