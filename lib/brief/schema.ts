// Structured brief output (Section 8.3). The AI returns JSON matching this
// shape; lib/brief/render.ts turns it into markdown. The AI never produces
// final rendered text directly, so the same content_json can re-render for
// email, web, and eventually push without regenerating.
import { z } from "zod";

export const briefTodayItemSchema = z.object({
  time: z.string().nullable(), // e.g. "9:00 AM", or null for an all-day item
  title: z.string().min(1),
  note: z.string().nullable().optional(), // travel-time warning, prep reminder, etc.
});

export const briefHeadsUpItemSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
});

export const briefPersonItemSchema = z.object({
  personLabel: z.string().min(1), // real name or a CHILD_N token, per docs/privacy.md
  reason: z.string().min(1), // MUST cite a specific duration/date/number (Section 8.4)
});

export const briefSuggestionSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
});

export const briefWeatherSchema = z.object({
  summary: z.string().min(1),
  highF: z.number().nullable(),
  lowF: z.number().nullable(),
});

export const briefContentSchema = z.object({
  headline: z.string().min(1),
  today: z.array(briefTodayItemSchema),
  headsUp: z.array(briefHeadsUpItemSchema),
  people: z.array(briefPersonItemSchema),
  suggestion: briefSuggestionSchema.nullable(),
  weather: briefWeatherSchema.nullable(),
});

export type BriefContent = z.infer<typeof briefContentSchema>;
