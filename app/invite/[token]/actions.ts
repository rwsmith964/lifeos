"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { acceptHouseholdInvite } from "@/lib/db/repositories/households";

export interface AcceptInviteState {
  error: string | null;
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

function isPostgrestLikeError(error: unknown): error is PostgrestLikeError {
  return typeof error === "object" && error !== null && "code" in error;
}

// accept_household_invite() (migration 20260827000001_household_invites.sql)
// raises distinct SQLSTATE codes for each rejection reason so this page can
// show the invitee something more useful than one generic failure message
// — in particular, "sent to a different email address" needs a genuinely
// different next action (sign out and use the right account) than
// "already used" or "expired" do.
const INVITE_ERROR_MESSAGES: Record<string, string> = {
  P0002: "That invite link isn't valid.",
  "22023": "That invite has already been used, revoked, or has expired.",
  "42501": "This invite was sent to a different email address than the one you're signed in with.",
  "28000": "You need to sign in first.",
};

export async function acceptInviteAction(token: string): Promise<AcceptInviteState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  try {
    await acceptHouseholdInvite(supabase, token);
  } catch (error) {
    console.error("Invite acceptance failed:", error);
    const code = isPostgrestLikeError(error) ? error.code : undefined;
    return {
      error: (code && INVITE_ERROR_MESSAGES[code]) ?? "Couldn't accept that invite — please try again.",
    };
  }
  redirect("/");
}
