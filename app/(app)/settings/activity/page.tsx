import Link from "next/link";
import { formatDistanceToNow, subDays } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listMembersOfHousehold } from "@/lib/db/repositories/households";
import { listActionLogSince } from "@/lib/db/repositories/action-log";
import { buildWeeklyDigest } from "@/lib/trust/weekly-digest";
import { Card, CardContent } from "@/components/ui/card";
import { UndoActionButton } from "./undo-action-button";

// QUEUE-011 remainder: a real UI for Module 3's trust layer. withActionLog
// (lib/trust/action-log.ts) has been writing one row per autonomous write
// since D-119, and generateAndSendWeeklyDigest (lib/trust/weekly-digest.ts)
// already formats + dispatches a "here's what I did this week" in-app
// notification whose linkPath points here -- but until now nothing
// rendered the log itself. This page covers both halves the brief asked
// for: a "this week" grouped-by-feature digest (the same buildWeeklyDigest
// shape the notification uses, rendered instead of just emailed/dispatched)
// and the full chronological log with per-entry undo.

// action_log.feature is intentionally free-text (see the table's own
// migration comment) -- new withActionLog call sites keep getting added,
// so this humanizes whatever key shows up instead of hard-coding a closed
// label map that would silently go stale. Never render the raw
// underscored key directly (standing rule against raw enum values).
function humanizeFeatureKey(feature: string): string {
  return feature
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

const LOG_WINDOW_DAYS = 30;
const DIGEST_WINDOW_DAYS = 7;

export default async function ActivityLogPage() {
  const { supabase, household, userId } = await requireHouseholdContext();
  const members = await listMembersOfHousehold(supabase, household.id);
  const selfMembership = members.find((m) => m.user_id === userId);
  const canManage = selfMembership?.role === "owner" || selfMembership?.role === "adult";

  const sinceISO = subDays(new Date(), LOG_WINDOW_DAYS).toISOString();
  const entries = await listActionLogSince(supabase, household.id, sinceISO);

  const weekSinceISO = subDays(new Date(), DIGEST_WINDOW_DAYS).toISOString();
  const digest = buildWeeklyDigest(entries.filter((e) => e.created_at >= weekSinceISO));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
          Settings
        </Link>
        <span className="text-sm text-muted-foreground">/</span>
        <h1 className="text-xl font-semibold">Activity</h1>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">This week</p>
            <p className="text-xs text-muted-foreground">
              What the assistant did on its own, grouped by feature.
            </p>
          </div>
          {digest.sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No autonomous actions were taken this week.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {digest.sections.map((section) => (
                <div key={section.feature} className="flex flex-col gap-1">
                  <p className="text-sm font-medium">
                    {humanizeFeatureKey(section.feature)} ({section.count})
                  </p>
                  <ul className="ml-4 list-disc text-xs text-muted-foreground">
                    {section.summaries.map((summary, i) => (
                      <li key={i}>{summary}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">All activity (last {LOG_WINDOW_DAYS} days)</p>
            <p className="text-xs text-muted-foreground">
              {canManage
                ? "Every autonomous action, most recent first. You can undo an action below."
                : "Every autonomous action, most recent first. Only owners and adults can undo an action."}
            </p>
          </div>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm">{entry.action_summary}</p>
                    {entry.decision_summary && (
                      <p className="text-xs text-muted-foreground">{entry.decision_summary}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {humanizeFeatureKey(entry.feature)} ·{" "}
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      {entry.undone_at ? " · Undone" : ""}
                    </p>
                  </div>
                  {canManage && entry.undoable && !entry.undone_at && <UndoActionButton entryId={entry.id} />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
