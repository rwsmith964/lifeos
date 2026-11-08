"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { friendlyMutationError } from "@/lib/db/errors";
import { householdLinkInvitesRepo, setLinkShare } from "@/lib/db/repositories/links";
import { peopleRepo } from "@/lib/db/repositories/people";
import { getSiteOrigin } from "@/lib/http/site-origin";
import { sendLinkInviteEmail } from "@/lib/notifications/invite-email";

export interface LinkActionResult {
  error: string | null;
  /** Shown when the email couldn't be delivered, so the link can be shared by hand. */
  inviteUrl?: string | null;
}

const inviteSchema = z.object({
  personId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

async function requireOwnerOrAdult() {
  const ctx = await requireHouseholdContext();
  const membership = ctx.memberships.find((m) => m.household.id === ctx.household.id);
  if (!membership || (membership.role !== "owner" && membership.role !== "adult")) {
    throw new Error("Only an owner or adult can do that.");
  }
  return ctx;
}

/** Invite someone from People (say, Rusty) to connect their own LifeOS household to yours. */
export async function sendLinkInviteAction(input: z.infer<typeof inviteSchema>): Promise<LinkActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };

  let ctx;
  try {
    ctx = await requireOwnerOrAdult();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }
  const { supabase, household, userId, selfPerson } = ctx;

  try {
    const person = await peopleRepo.getById(supabase, parsed.data.personId);
    if (!person || person.household_id !== household.id) return { error: "That person wasn't found." };
    if (person.linked_user_id) return { error: `${person.full_name} is already connected.` };

    const invite = await householdLinkInvitesRepo.create(supabase, {
      from_household_id: household.id,
      from_user_id: userId,
      for_person_id: person.id,
      invited_email: parsed.data.email,
    });
    const origin = await getSiteOrigin();
    const acceptUrl = `${origin}/link/${invite.token}`;
    const email = await sendLinkInviteEmail({
      to: invite.invited_email,
      inviterName: selfPerson.nickname || selfPerson.full_name,
      householdName: household.name,
      acceptUrl,
    });
    revalidatePath("/settings");
    return { error: null, inviteUrl: email.delivered ? null : acceptUrl };
  } catch (error) {
    return {
      error: friendlyMutationError(error, {
        uniqueViolation: "There's already a pending invite to that email — revoke it first to resend.",
        fallback: "Couldn't send that invite — please try again.",
      }),
    };
  }
}

export async function revokeLinkInviteAction(inviteId: string): Promise<LinkActionResult> {
  if (!z.string().uuid().safeParse(inviteId).success) return { error: "That invite wasn't found." };
  let ctx;
  try {
    ctx = await requireOwnerOrAdult();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }
  try {
    await householdLinkInvitesRepo.update(ctx.supabase, inviteId, { status: "revoked" });
    revalidatePath("/settings");
    return { error: null };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't revoke that — please try again." }) };
  }
}

/** Turn one kind of sharing on or off for one link. Always about what MY household shares. */
export async function setLinkShareAction(
  linkId: string,
  category: "busy_times" | "custody",
  enabled: boolean
): Promise<LinkActionResult> {
  if (!z.string().uuid().safeParse(linkId).success || (category !== "busy_times" && category !== "custody")) {
    return { error: "That connection wasn't found." };
  }
  let ctx;
  try {
    ctx = await requireOwnerOrAdult();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }
  try {
    await setLinkShare(ctx.supabase, { linkId, sharingHouseholdId: ctx.household.id, category, enabled });
    revalidatePath("/settings");
    return { error: null };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that — please try again." }) };
  }
}

/** Disconnect: sharing stops immediately (every cross-household read checks the link is active). */
export async function disconnectLinkAction(linkId: string): Promise<LinkActionResult> {
  if (!z.string().uuid().safeParse(linkId).success) return { error: "That connection wasn't found." };
  let ctx;
  try {
    ctx = await requireOwnerOrAdult();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }
  try {
    const { error } = await ctx.supabase.from("household_links").update({ status: "revoked" }).eq("id", linkId);
    if (error) throw error;
    revalidatePath("/settings");
    return { error: null };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't disconnect — please try again." }) };
  }
}
