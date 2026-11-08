"use server";

// Settings > Delete my account (App Store readiness -- Apple Guideline
// 5.1.1(v) requires apps that support account creation to also offer an
// in-app way to *initiate* account deletion; the only path before this
// was app/support/page.tsx's "email us" instruction, which reviewers do
// not accept as satisfying the guideline). See planAccountDeletion in
// lib/auth/account-deletion.ts for the fully unit-tested decision logic
// this orchestrates.
import { redirect } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { planAccountDeletion } from "@/lib/auth/account-deletion";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { householdMembersRepo, householdsRepo, listMembersOfHousehold } from "@/lib/db/repositories/households";
import { friendlyMutationError } from "@/lib/db/errors";

export interface DeleteAccountState {
  error: string | null;
}

export async function deleteMyAccountAction(): Promise<DeleteAccountState> {
  const { supabase, userId, memberships } = await requireHouseholdContext();

  const memberCounts = await Promise.all(
    memberships.map(async (m) => ({
      householdId: m.household.id,
      householdName: m.household.name,
      role: m.role,
      memberCount: (await listMembersOfHousehold(supabase, m.household.id)).length,
    }))
  );

  const plan = planAccountDeletion(memberCounts);
  if (plan.status === "blocked") {
    return {
      error:
        `You own "${plan.householdName}" along with ${plan.otherMemberCount} other ` +
        `${plan.otherMemberCount === 1 ? "person" : "people"}. Transfer ownership or remove ` +
        `the other member${plan.otherMemberCount === 1 ? "" : "s"} there first (Settings > Household members), ` +
        `then come back to delete your account.`,
    };
  }

  try {
    for (const step of plan.steps) {
      if (step.kind === "delete_household") {
        // RLS's "owners can delete their household" policy
        // (20260820000005) enforces this is only ever permitted for an
        // owner of THIS exact household -- every household_id foreign
        // key in the schema already cascades on delete, so this one
        // statement cleans up every table for it.
        await householdsRepo.remove(supabase, step.householdId);
      } else {
        const members = await listMembersOfHousehold(supabase, step.householdId);
        const ownMembership = members.find((m) => m.user_id === userId);
        if (ownMembership) {
          await householdMembersRepo.remove(supabase, ownMembership.id);
        }
      }
    }
  } catch (error) {
    return {
      error: friendlyMutationError(error, {
        fallback: "Couldn't delete your account -- please try again, or email support if this keeps happening.",
      }),
    };
  }

  // Deleting the actual login credentials (the auth.users row) requires
  // the Supabase Admin API, which only the service-role key can call --
  // no regular authenticated client can delete its own auth account,
  // however privileged its RLS role. This is the one narrow, deliberate
  // exception to client-service-role.ts's "never in a request-scoped
  // context" rule: the id passed is never caller-supplied, only the
  // already-verified `userId` requireHouseholdContext() itself just
  // resolved from this exact request's own session, after every
  // household of theirs was already handled above under normal RLS.
  const adminClient = createSupabaseServiceRoleClient();
  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    return {
      error:
        "Your household data was deleted, but removing your login failed -- email support to finish closing your account.",
    };
  }

  redirect("/account-deleted");
}
