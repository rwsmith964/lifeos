// Redesign (docs/redesign-brief.md Part 2 — People). The reference images
// showed a real three-tier rhythm system (settled/warning/slipping), not
// the settled-or-slipping binary Part 2's text describes — see
// docs/redesign-log.md's "Reference images received" note. Pure and
// unit-testable, same pattern as lib/contact/cadence.ts (which this
// builds on, not replaces).
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ContactCadenceRow, ContactType } from "../db/database.types";

export type RhythmTier = "settled" | "warning" | "slipping";

export interface RhythmStatus {
  tier: RhythmTier;
  label: string;
  /** 0-100, for the progress-bar fill. */
  healthPct: number;
}

/** Approaching-but-not-yet-over threshold: 70% of the way to the target interval. */
const WARNING_THRESHOLD_RATIO = 0.7;

export function evaluateRhythm(
  cadence: Pick<ContactCadenceRow, "target_interval_days" | "last_contact_date">,
  today: Date
): RhythmStatus {
  if (!cadence.last_contact_date) {
    return { tier: "slipping", label: "No contact logged", healthPct: 0 };
  }
  const daysSince = differenceInCalendarDays(today, parseISO(cadence.last_contact_date));
  const ratio = daysSince / Math.max(cadence.target_interval_days, 1);
  const tier: RhythmTier = ratio > 1 ? "slipping" : ratio >= WARNING_THRESHOLD_RATIO ? "warning" : "settled";
  const healthPct = Math.max(0, Math.min(100, Math.round((1 - Math.min(ratio, 1)) * 100)));
  return { tier, label: `${daysSince} of ${cadence.target_interval_days} days`, healthPct };
}

export function lastContactLabel(lastContactDate: string | null, lastContactType: ContactType | null): string {
  if (!lastContactDate) return "No contact logged";
  const date = parseISO(lastContactDate);
  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return lastContactType ? `${label} · ${lastContactType.replace(/_/g, " ")}` : label;
}
