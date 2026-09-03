"use server";

import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { generateDailyBrief } from "@/lib/brief/generate";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { briefsRepo, getBriefForPersonAndDate } from "@/lib/db/repositories/system";
import { friendlyMutationError } from "@/lib/db/errors";

export interface RegenerateBriefState {
  error: string | null;
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

  try {
    const serviceRoleClient = createSupabaseServiceRoleClient();
    const existing = await getBriefForPersonAndDate(serviceRoleClient, selfPerson.id, todayDateStr);
    if (existing) {
      await briefsRepo.remove(serviceRoleClient, existing.id);
    }
    await generateDailyBrief(serviceRoleClient, household.id, selfPerson.id, today);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't regenerate the brief — please try again." }) };
  }

  revalidatePath("/");
  return { error: null };
}
