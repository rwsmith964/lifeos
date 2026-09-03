// Module 3 (universal_intake_v2, D-136) display labels. Kept out of the
// page/route files so client components can import these without pulling
// in server-only modules -- and so the ground rule "don't show raw enum
// values, ISO dates, or Markdown syntax to the user anywhere" has exactly
// one place to check for this module's record-type and field-key enums.
import type { IntakeDraftRow } from "../db/database.types";

export type IntakeRecordType = NonNullable<IntakeDraftRow["detected_record_type"]>;

export const RECORD_TYPE_LABELS: Record<IntakeRecordType, string> = {
  calendar_event: "Calendar event",
  gift_idea: "Gift idea",
  person: "New person",
  moment: "Family moment",
  person_note: "Note about someone",
  task: "Task (can't auto-add yet)",
  recipe: "Recipe",
  flight: "Flight",
  ambiguous: "Not sure what this is",
};

export const SOURCE_TYPE_LABELS: Record<IntakeDraftRow["source_type"], string> = {
  text: "Pasted text",
  voice: "Voice note",
  ics: "Calendar file",
  image: "Photo",
  screenshot: "Screenshot",
  pdf: "PDF",
  email: "Forwarded email",
};

/** Record types that need the reviewer to pick which household member
 * the draft is about before it can be approved -- kept in sync with
 * convertDraftToRecord's `resolvedPersonId` checks in lib/intake/convert.ts. */
export const RECORD_TYPES_NEEDING_PERSON: readonly IntakeRecordType[] = ["gift_idea", "person_note"];

/** Friendly labels for the extracted_fields keys this module produces,
 * so the review card never shows a raw camelCase key to the user. Keys
 * not listed here fall back to a humanized version of the key itself. */
const FIELD_LABELS: Record<string, string> = {
  eventTitle: "Title",
  eventStartsAtISO: "Starts",
  eventEndsAtISO: "Ends",
  eventAllDay: "All day",
  eventType: "Type",
  giftDescription: "Gift",
  giftOccasionType: "Occasion",
  giftOccasionDate: "Occasion date",
  giftCostDollars: "Estimated cost",
  noteText: "Note",
  fullName: "Full name",
  relationshipType: "Relationship",
  nickname: "Nickname",
  birthdate: "Birthdate",
  title: "Title",
  occurredOn: "Date",
  place: "Place",
  notes: "Notes",
  recipeTitle: "Recipe name",
  recipeIngredients: "Ingredients",
  recipeInstructions: "Instructions",
  recipeServings: "Servings",
  recipeSourceUrl: "Source link",
  personNameMentioned: "Name mentioned",
  flightAirline: "Airline",
  flightNumber: "Flight number",
  flightDepartureAirport: "Departure airport",
  flightDepartureAtISO: "Departs",
  flightArrivalAirport: "Arrival airport",
  flightArrivalAtISO: "Arrives",
};

function humanizeKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function labelForField(key: string): string {
  return FIELD_LABELS[key] ?? humanizeKey(key);
}

/** Renders one extracted field's value as plain, human-readable text --
 * never a raw ISO timestamp, boolean literal, or null. Dates are
 * formatted by the caller (which has access to date-fns); this only
 * covers the value shapes that are safe to stringify directly. */
export function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "giftCostDollars" && typeof value === "number") return `$${value.toFixed(2)}`;
  if (typeof value === "number") return String(value);
  return String(value);
}

/** Field keys already surfaced elsewhere in the card (title-like fields)
 * or that are internal routing hints rather than user-facing content --
 * excluded from the generic "other details" field list so nothing is
 * shown twice or shown as noise. personNameMentioned is handled specially
 * by the person picker, not the generic field list. */
export const FIELD_KEYS_HANDLED_ELSEWHERE = new Set(["personNameMentioned"]);
