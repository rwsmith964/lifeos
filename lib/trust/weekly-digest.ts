// Module 3 (D-119, universal_intake_v2 flag): "here's what I did" weekly
// digest. Pure formatter over action_log rows (already written by
// withActionLog -- see lib/trust/action-log.ts) plus a thin generator
// that sends the formatted digest through the EXISTING notification
// dispatcher (lib/notifications/dispatch.ts). No new send/transport
// logic is built here -- per the brief, this doubles as a retention
// surface, not a new delivery channel.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionLogRow } from "../db/database.types";
import { listActionLogSince } from "../db/repositories/action-log";
import { dispatchNotification, type DispatchResult } from "../notifications/dispatch";

export interface WeeklyDigestSection {
  feature: string;
  count: number;
  summaries: string[];
}

export interface WeeklyDigest {
  totalActions: number;
  sections: WeeklyDigestSection[];
  bodyText: string;
}

/**
 * Groups a week's action_log rows by feature and renders one line per
 * entry using each row's own action_summary -- never a re-derived or
 * re-guessed description, since action_summary is the record of what
 * the wrapper actually saw at write time (see withActionLog).
 */
export function buildWeeklyDigest(entries: ActionLogRow[]): WeeklyDigest {
  if (entries.length === 0) {
    return {
      totalActions: 0,
      sections: [],
      bodyText: "No autonomous actions were taken this week.",
    };
  }

  const byFeature = new Map<string, ActionLogRow[]>();
  for (const entry of entries) {
    const bucket = byFeature.get(entry.feature) ?? [];
    bucket.push(entry);
    byFeature.set(entry.feature, bucket);
  }

  const sections: WeeklyDigestSection[] = Array.from(byFeature.entries())
    .map(([feature, rows]) => ({
      feature,
      count: rows.length,
      summaries: rows.map((r) => r.action_summary),
    }))
    // Stable, deterministic order for a formatted digest -- most-active
    // feature first, ties broken alphabetically.
    .sort((a, b) => b.count - a.count || a.feature.localeCompare(b.feature));

  const lines = sections.flatMap((section) => [`${section.feature} (${section.count}):`, ...section.summaries.map((s) => `  - ${s}`)]);

  return {
    totalActions: entries.length,
    sections,
    bodyText: `Here's what I did this week (${entries.length} action${entries.length === 1 ? "" : "s"}):\n\n${lines.join("\n")}`,
  };
}

/**
 * Builds and sends one household's weekly digest via the existing
 * in-app channel. `recipientPersonId` is whichever household member the
 * digest is addressed to -- callers (a future cron, per Module
 * 4/scheduling work) decide who that is; this function only formats and
 * dispatches, it never decides a schedule.
 *
 * NOTE (QUESTIONS.md QUEUE-0xx): real outbound email beyond the
 * household's own owner account is already blocked by the pre-existing
 * unverified-Resend-domain issue (see project knowledge
 * concepts/transactional-email-delivery) -- unrelated to this module,
 * not a new limitation introduced here. The in_app channel is
 * unaffected and is what this function uses.
 */
export async function generateAndSendWeeklyDigest(
  client: SupabaseClient,
  householdId: string,
  recipientPersonId: string,
  sinceISO: string
): Promise<{ digest: WeeklyDigest; dispatch: DispatchResult[] }> {
  const entries = await listActionLogSince(client, householdId, sinceISO);
  const digest = buildWeeklyDigest(entries);

  const dispatch = await dispatchNotification(
    client,
    {
      householdId,
      personId: recipientPersonId,
      notificationType: "weekly_action_digest",
      title: "Here's what I did this week",
      body: digest.bodyText,
      linkPath: "/settings/activity",
    },
    ["in_app"]
  );

  return { digest, dispatch };
}
