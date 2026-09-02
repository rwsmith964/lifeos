// Module 8 (brief_registration_v2, D-1XX). The generic registration
// interface the brief brief §8 calls for: "Each module contributes brief
// items through a single registration interface. Items declare priority,
// category, and a lead time. The brief composes; modules don't format."
//
// A contributor is a plain async function -- no global mutable registry,
// no side-effecting "register()" call at module-load time. Next.js runs
// this as a server component per request in a serverless runtime, where a
// module-scope singleton registry would be fragile (cold starts, multiple
// isolates) for no real benefit over a plain array of imports built in one
// place (see contributors/index.ts). "Single registration interface" means
// every module's contribution has the same shape and goes through the same
// compose/cap step, not that there is a stateful registry object.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Extensible on purpose -- a new module contributing to the brief adds a
 * new string here (and a cap in DEFAULT_CAPS, contributors/compose.ts) and
 * nowhere else. Not a closed union of the five pre-Module-8 AI sections;
 * those are contributed as a single "ai" category (see contributors/ai-content.ts)
 * so this type doesn't need to know AI's internal shape.
 */
export type BriefCategory = "ai" | "opportunities" | "household";

export interface BriefItem {
  /** Stable within one brief render -- used as the React key, never persisted. */
  id: string;
  category: BriefCategory;
  /** Higher sorts first within its category. Compose ranks and caps within
   * a category by this value alone -- there is no cross-category ranking,
   * since "Today" and "Opportunities" aren't commensurable. */
  priority: number;
  /** Days until this item stops being relevant -- 0 means "today only".
   * Not currently used to filter (every contributor already scopes its own
   * query to a relevant window), but declared per the brief's spec so a
   * future cross-module staleness check has a field to read instead of
   * needing a schema change later. */
  leadTimeDays: number;
  title: string;
  detail?: string | null;
  href?: string | null;
}

export interface BriefContributorContext {
  supabase: SupabaseClient;
  householdId: string;
  personId: string;
  today: Date;
}

export type BriefContributor = (ctx: BriefContributorContext) => Promise<BriefItem[]>;
