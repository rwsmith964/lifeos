// Pure decision logic for "delete my account" (Settings, App Store
// readiness -- Apple Guideline 5.1.1(v) requires an in-app way to
// initiate account deletion; there was previously only an email-request
// path in app/support/page.tsx). Kept separate from the actual Server
// Action (app/(app)/settings/account-actions.ts) so the one part that
// really matters -- which of a user's households get fully deleted vs.
// just left, and when the whole operation should be refused outright --
// is fully unit-testable without mocking Supabase or exercising a real
// (and, in this sandbox, irreplaceable) production account.
import type { HouseholdRole } from "../db/database.types";

export interface MembershipInput {
  householdId: string;
  householdName: string;
  role: HouseholdRole;
  memberCount: number;
}

export type HouseholdDeletionStep =
  // Caller is the sole member of this household (always its owner, by
  // construction -- no other way to become a member except being invited
  // by one) -- delete the whole household. RLS's "owners can delete
  // their household" policy (20260820000005) enforces this is only ever
  // permitted for an owner; every household_id foreign key in the schema
  // already cascades, so this alone cleans up every table.
  | { kind: "delete_household"; householdId: string }
  // Caller is a non-owner member of a household others still use --
  // remove just this membership, same as the existing leaveHouseholdAction,
  // leaving the shared household and its data untouched for everyone else.
  | { kind: "leave_household"; householdId: string };

export type AccountDeletionPlan =
  | { status: "ready"; steps: HouseholdDeletionStep[] }
  // Caller owns a household that other people still depend on -- refuse
  // the WHOLE deletion (not just that one household) rather than leaving
  // some of their households deleted and others not, and name exactly
  // which household needs attention first so they have something
  // actionable to do about it.
  | { status: "blocked"; householdName: string; otherMemberCount: number };

export function planAccountDeletion(memberships: MembershipInput[]): AccountDeletionPlan {
  for (const m of memberships) {
    if (m.role === "owner" && m.memberCount > 1) {
      return { status: "blocked", householdName: m.householdName, otherMemberCount: m.memberCount - 1 };
    }
  }

  return {
    status: "ready",
    steps: memberships.map((m) =>
      m.memberCount <= 1 ? { kind: "delete_household", householdId: m.householdId } : { kind: "leave_household", householdId: m.householdId }
    ),
  };
}
