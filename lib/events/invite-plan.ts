// How an invitation reaches each person picked for an event, decided from what
// we know about them. Pure so the rules (and the wording the form shows) are
// testable.
import { z } from "zod";
import type { ItineraryItem } from "../db/database.types";

export type InviteDelivery =
  /** Has an account in this household: the event is already on their calendar. */
  | "member"
  /** Has their own LifeOS household, connected to ours: delivered in the app (and by email if known). */
  | "linked"
  /** Not on LifeOS: emailed an RSVP link. */
  | "email"
  /** No account and no email: can't be invited yet. */
  | "none";

export interface InvitablePerson {
  user_id: string | null;
  linked_user_id: string | null;
  email: string | null;
}

export function deliveryFor(person: InvitablePerson): InviteDelivery {
  if (person.user_id) return "member";
  if (person.linked_user_id) return "linked";
  if (person.email && person.email.includes("@")) return "email";
  return "none";
}

export const DELIVERY_LABEL: Record<InviteDelivery, string> = {
  member: "In your household — it's on their calendar",
  linked: "Connected — invitation goes to their app",
  email: "Will be emailed an invitation",
  none: "No email on file — add one to invite them",
};

const itineraryItemSchema = z.object({
  time: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(500).catch(""),
});

/** Parses the itinerary JSON the form submits; bad rows are dropped, never fatal. */
export function parseItinerary(raw: string | null | undefined): ItineraryItem[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const items: ItineraryItem[] = [];
  for (const entry of data.slice(0, 30)) {
    const parsed = itineraryItemSchema.safeParse(entry);
    if (parsed.success) items.push({ time: parsed.data.time, title: parsed.data.title, notes: parsed.data.notes });
  }
  // Timed rows in clock order; untimed rows keep their place after.
  return items.sort((a, b) => {
    if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });
}

/** Per-person notes the form submits as note__<personId> fields. */
export function collectAttendeeNotes(entries: Iterable<[string, FormDataEntryValue]>): Map<string, string> {
  const notes = new Map<string, string>();
  for (const [key, value] of entries) {
    if (!key.startsWith("note__") || typeof value !== "string") continue;
    const text = value.trim();
    if (text) notes.set(key.slice("note__".length), text.slice(0, 500));
  }
  return notes;
}

export function summarizeItinerary(items: ItineraryItem[]): string {
  return items.map((i) => `${i.time ? `${i.time} ` : ""}${i.title}${i.notes ? ` (${i.notes})` : ""}`).join("\n");
}
