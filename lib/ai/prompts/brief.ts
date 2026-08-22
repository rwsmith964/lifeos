// Daily brief feature prompt (Section 8.3, 8.4). Builds the user-turn
// prompt from already-fetched context; no DB/network I/O here.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "./base";
import { briefContentSchema } from "../../brief/schema";

export const BRIEF_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are generating today's brief for the user: one generated summary that must be readable on a phone in under thirty seconds, and specific enough that skipping it feels risky. Tone rules, no exceptions:
1. Lead with what changed or what needs action. Never open with a greeting ("Good morning") or restate the date.
2. Never state something the user already obviously knows (e.g. don't say "today is Tuesday").
3. Every item in "people" MUST cite something specific and concrete — a number of days since contact, an exact date, a specific fact. A people item without a concrete reason is a failed item; omit it rather than pad the list.
4. If there is genuinely nothing notable today, say so in one line via the headline and leave the other arrays empty. Do not manufacture content to seem useful — that trains the user to ignore the brief entirely.
5. Only assert a weather condition, travel time, or external fact if it is present in the context you were given below. If weather data wasn't provided, omit the "weather" field (set it to null) rather than guessing.

Return ONLY a single JSON object with exactly this shape (no prose, no markdown fences):
{
  "headline": string,
  "today": [{ "time": string | null, "title": string, "note": string | null }],
  "headsUp": [{ "title": string, "detail": string }],
  "people": [{ "personLabel": string, "reason": string }],
  "suggestion": { "title": string, "detail": string } | null,
  "weather": { "summary": string, "highF": number | null, "lowF": number | null } | null
}`;

export const briefAiResponseSchema = briefContentSchema;
export type BriefAiResponse = z.infer<typeof briefAiResponseSchema>;

export interface BriefEventContext {
  time: string | null; // pre-formatted in the user's timezone
  title: string;
  eventType: string;
  travelNote: string | null; // e.g. "35 min drive from home"
  isTomorrow: boolean;
}

export interface BriefGiftReminderContext {
  personLabel: string;
  occasionType: string;
  occasionDate: string;
  orderByDate: string;
  daysUntilOrderBy: number;
}

export interface BriefOverdueContactContext {
  personLabel: string;
  daysSinceLastContact: number | null;
  activityType: string | null; // e.g. "golf", from a shared user_activity, if known
}

export interface BriefPrepObligationContext {
  activityTitle: string;
  prepAtLabel: string; // pre-formatted, e.g. "Friday evening"
}

export interface BriefWeatherContext {
  summary: string;
  highF: number | null;
  lowF: number | null;
}

export interface BriefContextInput {
  todayLabel: string; // e.g. "Tuesday, August 25" — for the model's own reference, not to be echoed verbatim
  events: BriefEventContext[];
  giftReminders: BriefGiftReminderContext[];
  overdueContacts: BriefOverdueContactContext[];
  prepObligations: BriefPrepObligationContext[];
  weather: BriefWeatherContext | null;
  weekendPlanSummary: string | null; // populated only when today is Wed-Fri
}

export function buildBriefUserPrompt(ctx: BriefContextInput): string {
  const lines: string[] = [];
  lines.push(`Reference date: ${ctx.todayLabel} (do not restate this in the brief — it's context only)`);

  lines.push("", "Today's and tomorrow's events:");
  if (ctx.events.length === 0) {
    lines.push("(no events scheduled)");
  } else {
    for (const event of ctx.events) {
      const when = event.isTomorrow ? "Tomorrow" : "Today";
      const time = event.time ? ` ${event.time}` : "";
      const travel = event.travelNote ? ` [travel: ${event.travelNote}]` : "";
      lines.push(`- ${when}${time}: ${event.title} (${event.eventType})${travel}`);
    }
  }

  lines.push("", "Gift order-by reminders due within 14 days:");
  if (ctx.giftReminders.length === 0) {
    lines.push("(none)");
  } else {
    for (const gift of ctx.giftReminders) {
      lines.push(
        `- ${gift.personLabel}'s ${gift.occasionType} is ${gift.occasionDate}; order by ${gift.orderByDate} (${gift.daysUntilOrderBy} days from now)`
      );
    }
  }

  lines.push("", "Overdue contact cadences:");
  if (ctx.overdueContacts.length === 0) {
    lines.push("(none overdue)");
  } else {
    for (const contact of ctx.overdueContacts) {
      const activity = contact.activityType ? ` (${contact.activityType})` : "";
      const days =
        contact.daysSinceLastContact == null
          ? "no contact on record"
          : `${contact.daysSinceLastContact} days since last contact`;
      lines.push(`- ${contact.personLabel}${activity}: ${days}`);
    }
  }

  lines.push("", "Prep obligations for tomorrow's activities:");
  if (ctx.prepObligations.length === 0) {
    lines.push("(none)");
  } else {
    for (const prep of ctx.prepObligations) {
      lines.push(`- ${prep.activityTitle}: prep by ${prep.prepAtLabel}`);
    }
  }

  lines.push("", "Weather:");
  lines.push(
    ctx.weather ? `${ctx.weather.summary}, high ${ctx.weather.highF ?? "?"}, low ${ctx.weather.lowF ?? "?"}` : "(not available)"
  );

  if (ctx.weekendPlanSummary) {
    lines.push("", "This week's weekend plan (today is Wed-Fri, include a brief mention if relevant):");
    lines.push(ctx.weekendPlanSummary);
  }

  return lines.join("\n");
}
