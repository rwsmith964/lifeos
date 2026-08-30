"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { opportunitiesRepo } from "@/lib/db/repositories/opportunities";
import { userActivitiesRepo } from "@/lib/db/repositories/activities";
import type { OpportunityStatus } from "@/lib/db/database.types";

export async function updateOpportunityStatusAction(opportunityId: string, status: OpportunityStatus) {
  const { supabase } = await requireHouseholdContext();
  // Update goes through the user-scoped, RLS-enforced client (not
  // service-role) -- the opportunities migration restricts UPDATE to
  // owner/adult roles, so a child-role account attempting this will get a
  // clean RLS rejection here rather than an unauthorized service-role write.
  const opportunity = await opportunitiesRepo.update(supabase, opportunityId, { status });

  // D-083 (P3-1): marking an opportunity "Acted on" is ground truth that the
  // activity actually happened on that date -- write it into
  // user_activities.last_done_at so the recency signal feeds future scoring
  // (see lib/planner/scoring.ts) without the user having to also go edit the
  // activity by hand. Only activity-backed opportunities have an
  // activity_id (trip-idea opportunities don't); best-effort, not fatal to
  // the status update if it fails.
  if (status === "acted_on" && opportunity.activity_id) {
    try {
      await userActivitiesRepo.update(supabase, opportunity.activity_id, {
        last_done_at: opportunity.for_date,
      });
    } catch (error) {
      console.error("Failed to record last_done_at from opportunity acted_on:", error);
    }
  }

  revalidatePath("/opportunities");
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/activities");
}
