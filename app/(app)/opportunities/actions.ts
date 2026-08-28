"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { opportunitiesRepo } from "@/lib/db/repositories/opportunities";
import type { OpportunityStatus } from "@/lib/db/database.types";

export async function updateOpportunityStatusAction(opportunityId: string, status: OpportunityStatus) {
  const { supabase } = await requireHouseholdContext();
  // Update goes through the user-scoped, RLS-enforced client (not
  // service-role) -- the opportunities migration restricts UPDATE to
  // owner/adult roles, so a child-role account attempting this will get a
  // clean RLS rejection here rather than an unauthorized service-role write.
  await opportunitiesRepo.update(supabase, opportunityId, { status });
  revalidatePath("/opportunities");
  revalidatePath("/");
  revalidatePath("/calendar");
}
