"use server";

// Server Actions for the Settings > Household members section (Phase 4.1:
// household membership / multi-user, see DECISIONS.md D-055). Kept in a
// separate file from actions.ts (household name/budget/timezone/address
// settings) since this is a genuinely separate feature with its own repo,
// schema, and email side effect.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import {
  householdInvitesRepo,
  householdMembersRepo,
  listHouseholdMemberEmails,
  listMembersOfHousehold,
  usersRepo,
} from "@/lib/db/repositories/households";
import { householdInviteInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { getSiteOrigin } from "@/lib/http/site-origin";
import { sendHouseholdInviteEmail } from "@/lib/notifications/invite-email";

export interface HouseholdInviteFormState {
  error: string | null;
  sent: boolean;
  // Populated only when the email channel didn't actually deliver (e.g. no
  // RESEND_API_KEY configured, or the send call itself failed) so the UI
  // can offer a "copy invite link" fallback — the invite row is fully
  // valid either way, this just avoids a dead end where the only copy of
  // the accept link is a server console log the owner can't reach.
  inviteUrl: string | null;
}

/**
 * Owner/adult-only guard shared by every mutating action in this file.
 * household_members' own INSERT/UPDATE policies already enforce this
 * server-side too (defense in depth), but checking here first means a
 * viewer role gets a clean "You don't have permission" message instead of
 * a raw Postgres RLS error surfacing through friendlyMutationError's
 * generic fallback.
 */
async function requireOwnerOrAdult() {
  const ctx = await requireHouseholdContext();
  const members = await listMembersOfHousehold(ctx.supabase, ctx.household.id);
  const selfMembership = members.find((m) => m.user_id === ctx.userId);
  if (!selfMembership || (selfMembership.role !== "owner" && selfMembership.role !== "adult")) {
    throw new Error("Only household owners and adults can manage members.");
  }
  return ctx;
}

export async function sendHouseholdInviteAction(
  _prevState: HouseholdInviteFormState,
  formData: FormData
): Promise<HouseholdInviteFormState> {
  let ctx;
  try {
    ctx = await requireOwnerOrAdult();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed.", sent: false, inviteUrl: null };
  }
  const { supabase, household, userId } = ctx;

  const parsed = householdInviteInsertSchema.safeParse({
    invited_email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "adult"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", sent: false, inviteUrl: null };
  }

  // Inviting someone already a member is almost always a mistake (they'd
  // just get a "you're already a member" no-op on accept) — catch it here
  // with a clear message rather than silently sending a pointless email.
  const memberEmails = await listHouseholdMemberEmails(supabase, household.id);
  if ([...memberEmails.values()].some((email) => email.toLowerCase() === parsed.data.invited_email)) {
    return { error: "That person is already a member of this household.", sent: false, inviteUrl: null };
  }

  let invite;
  try {
    invite = await householdInvitesRepo.create(supabase, {
      household_id: household.id,
      invited_email: parsed.data.invited_email,
      role: parsed.data.role,
      invited_by_user_id: userId,
    });
  } catch (error) {
    return {
      error: friendlyMutationError(error, {
        // household_invites_pending_email_idx (partial unique index on
        // (household_id, lower(invited_email)) where status='pending')
        uniqueViolation: "There's already a pending invite for that email — revoke it first to resend.",
        fallback: "Couldn't send that invite — please try again.",
      }),
      sent: false,
      inviteUrl: null,
    };
  }

  const inviter = await usersRepo.getById(supabase, userId);
  const origin = await getSiteOrigin();
  const acceptUrl = `${origin}/invite/${invite.token}`;
  const emailResult = await sendHouseholdInviteEmail({
    to: invite.invited_email,
    householdName: household.name,
    inviterName: inviter?.display_name ?? "A household member",
    acceptUrl,
  });
  if (!emailResult.delivered) {
    // Not a hard failure — the invite row exists and is fully valid
    // either way; RESEND_API_KEY not being configured (console-stub
    // fallback) is expected in dev/test. Still surface it so a real prod
    // misconfiguration is obvious to the person who just clicked "Send".
    console.warn(`Household invite email not delivered: ${emailResult.detail}`);
  }

  revalidatePath("/settings");
  return { error: null, sent: true, inviteUrl: emailResult.delivered ? null : acceptUrl };
}

export interface HouseholdMutationState {
  error: string | null;
}

export async function revokeHouseholdInviteAction(inviteId: string): Promise<HouseholdMutationState> {
  let ctx;
  try {
    ctx = await requireOwnerOrAdult();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }
  try {
    await householdInvitesRepo.update(ctx.supabase, inviteId, { status: "revoked" });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't revoke that invite." }) };
  }
  revalidatePath("/settings");
  return { error: null };
}

/**
 * Owner-only removal of a DIFFERENT member. This is distinct from a member
 * leaving voluntarily (see leaveHouseholdAction below) — the existing
 * "owners remove members" DELETE policy (20260820000005) already enforces
 * owner-only server-side, so this action's own role check is defense in
 * depth, same as everywhere else in this file.
 */
export async function removeMemberAction(memberId: string): Promise<HouseholdMutationState> {
  const ctx = await requireHouseholdContext();
  const members = await listMembersOfHousehold(ctx.supabase, ctx.household.id);
  const selfMembership = members.find((m) => m.user_id === ctx.userId);
  if (!selfMembership || selfMembership.role !== "owner") {
    return { error: "Only the household owner can remove members." };
  }
  try {
    await householdMembersRepo.remove(ctx.supabase, memberId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that member." }) };
  }
  revalidatePath("/settings");
  return { error: null };
}

/**
 * A non-owner member leaving the household under their own steam — see
 * migration 20260827000001's "non-owner members can leave a household"
 * policy for why this needed a NEW DELETE policy at all (the old one only
 * ever let an owner remove someone else). Redirects to /onboarding
 * afterward since requireHouseholdContext() would otherwise send this now
 * household-less user right back to a household they can no longer see.
 */
export async function leaveHouseholdAction(): Promise<HouseholdMutationState> {
  const ctx = await requireHouseholdContext();
  const members = await listMembersOfHousehold(ctx.supabase, ctx.household.id);
  const selfMembership = members.find((m) => m.user_id === ctx.userId);
  if (!selfMembership) {
    return { error: "You're not a member of this household." };
  }
  if (selfMembership.role === "owner") {
    return { error: "The owner can't leave a household — delete it instead if you want to disband it." };
  }
  try {
    await householdMembersRepo.remove(ctx.supabase, selfMembership.id);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't leave that household." }) };
  }
  redirect("/onboarding");
}
