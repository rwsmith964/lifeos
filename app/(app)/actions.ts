"use server";

import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { generateDailyBrief } from "@/lib/brief/generate";
import { summarizeBriefChanges } from "@/lib/brief/diff-summary";
import type { BriefContent } from "@/lib/brief/schema";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { briefsRepo, getBriefForPersonAndDate } from "@/lib/db/repositories/system";
import { friendlyMutationError } from "@/lib/db/errors";

export interface RegenerateBriefState {
  error: string | null;
  /** B6: a short "what changed" summary shown after a refresh completes -- null on error, or when there was no prior brief to diff against. */
  changesSummary: string | null;
}

/**
 * KNOWN-ISSUES.md: the daily brief is generated once (by the cron, or by
 * this page's own on-demand fallback for whoever opens the app first) and
 * then just read back verbatim — there was no way to force a fresh one if
 * its content had gone stale (e.g. it referenced a person/gift/event that
 * was since deleted or changed). Deletes today's existing row for this
 * person and regenerates from current data. Uses the service-role client
 * for the same reason generateWeekendPlanAction does: `briefs` has no
 * insert/delete policy for regular authenticated users by design (only
 * the cron's service-role client is meant to write it) — household.id and
 * selfPerson.id are already scoped above, so handing generation a
 * service-role client doesn't broaden what it can touch.
 */
export async function regenerateBriefAction(): Promise<RegenerateBriefState> {
  const { household, selfPerson, timezone } = await requireHouseholdContext();
  // D-143: household-local today, not a bare `new Date()` -- see
  // lib/timezones.ts's getZonedNow for why.
  const today = getZonedNow(timezone);
  const todayDateStr = format(today, "yyyy-MM-dd");

  let changesSummary: string | null = null;
  try {
    const serviceRoleClient = createSupabaseServiceRoleClient();
    const existing = await getBriefForPersonAndDate(serviceRoleClient, selfPerson.id, todayDateStr);
    const beforeContent = (existing?.content_json as BriefContent | undefined) ?? null;
    if (existing) {
      await briefsRepo.remove(serviceRoleClient, existing.id);
    }
    // D-03: a manual rebuild is already visible to whoever clicked it --
    // it shouldn't also mint a new unread "daily_brief" notification, the
    // way the cron's once-a-day generation should.
    const result = await generateDailyBrief(serviceRoleClient, household.id, selfPerson.id, today, false);
    const newBrief = await briefsRepo.getById(serviceRoleClient, result.briefId);
    const afterContent = newBrief?.content_json as BriefContent | undefined;
    if (afterContent) changesSummary = summarizeBriefChanges(beforeContent, afterContent);
  } catch (error) {
    return {
      error: friendlyMutationError(error, { fallback: "Couldn't refresh the briefing — please try again." }),
      changesSummary: null,
    };
  }

  revalidatePath("/");
  return { error: null, changesSummary };
}
