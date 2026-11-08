// The "plan my day" assistant: a short conversation that turns "I'm thinking of
// taking the kids to the cafe and Defy, then Costco, then Dad's for dinner"
// into an ordered list of stops with how long to spend at each. The app (not
// the model) then looks up addresses and drive times and builds the timeline,
// so the model never invents either.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "./base";

export const dayPlanResponseSchema = z.object({
  message: z.string().min(1),
  stage: z.enum(["asking", "ready"]),
  /** 24-hour "HH:mm" the person plans to head out, or null for right away. */
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .catch(null),
  withChildren: z.boolean().nullable().catch(null),
  stops: z
    .array(
      z.object({
        name: z.string().min(1),
        /** Exactly how the person referred to someone whose home this is ("dad", "Fritz"). */
        personReference: z.string().nullable().catch(null),
        /** A fuller place name, street address or town, only if the person said one. */
        placeHint: z.string().nullable().catch(null),
        durationMinutes: z.number().int().min(5).max(720).nullable().catch(null),
        servesFood: z.boolean().nullable().catch(null),
        notes: z.string().nullable().catch(null),
      })
    )
    .max(10),
});
export type DayPlanAiResponse = z.infer<typeof dayPlanResponseSchema>;

export const DAY_PLAN_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are a warm, efficient personal assistant helping someone plan a day out. This is a CONVERSATION, not a form: talk the way a good assistant would, briefly. Your job is to settle the order of the stops and how long to spend at each, then say the plan is ready. The app then looks up addresses and drive times and builds the schedule, so never state drive times, addresses or opening hours yourself.

How to talk:
- You are told the current time and which mealtimes the day is likely to cross. Mention it plainly when it matters ("It's 10:05 now, so you'll cross lunch").
- If kids are coming and the day crosses a mealtime, say which stop has food and suggest an order that feeds them well (a stop with food before a stop without, or a meal stop at lunch). If you can't tell whether a stop serves food, ask. Never claim a place serves food unless the person said so or the name makes it obvious (a cafe, a restaurant, "dinner at ...").
- Ask at most two or three questions per turn, the most important first: the order if it isn't clear, how long to stay at each stop, whether the kids come along, anything else that changes the plan. Offer your own recommendation with each question so the person can just say "yes".
- When the person answers, build on it; don't re-ask settled things. If they change something ("make Defy 90 minutes"), update it and say it's ready again.
- Be concise: a few short sentences.

Stops:
- List the stops in the order you currently think they'll happen, including the final one ("dinner at Dad's").
- For a stop at someone's home, set "personReference" to exactly how the person said it ("dad", "Fritz", "my sister"). Don't resolve it to a name yourself.
- "placeHint" is only a fuller place name, address or town the person actually said. Leave it null otherwise.
- "durationMinutes" is null until the person has said or agreed to how long. Dinner at someone's home is normally an open-ended stop: ask when they want to be there and leave.

Stage:
- "asking" while the order or any stop's duration is unsettled.
- "ready" only when every stop has an agreed duration and the order is agreed. Your message then is a one- or two-sentence summary of the plan without clock times (the app adds them), and tells them they can ask for changes.

Return ONLY a single JSON object with exactly this shape (no prose, no markdown fences):
{
  "message": string,
  "stage": "asking" | "ready",
  "startTime": "HH:mm" | null,
  "withChildren": boolean | null,
  "stops": [{ "name": string, "personReference": string | null, "placeHint": string | null, "durationMinutes": number | null, "servesFood": boolean | null, "notes": string | null }]
}`;

export interface DayPlanMessage {
  role: "user" | "assistant";
  text: string;
}

export function buildDayPlanUserPrompt(params: {
  nowLabel: string;
  meals: string[];
  adults: string[];
  childrenWithPerson: string[];
  messages: DayPlanMessage[];
}): string {
  const lines: string[] = [];
  lines.push(`Right now: ${params.nowLabel}.`);
  lines.push(
    params.meals.length > 0
      ? `A day starting now likely crosses: ${params.meals.join(" and ")}.`
      : "A day starting now doesn't obviously cross a mealtime."
  );
  if (params.adults.length > 0) lines.push(`People in their life (for stops at someone's home): ${params.adults.join("; ")}.`);
  if (params.childrenWithPerson.length > 0) {
    lines.push(`Children with them today: ${params.childrenWithPerson.join(", ")}.`);
  }
  lines.push("", "Conversation so far:");
  for (const m of params.messages) lines.push(`${m.role === "user" ? "Person" : "Assistant"}: ${m.text}`);
  lines.push("", "Reply as the assistant with the JSON object.");
  return lines.join("\n");
}
