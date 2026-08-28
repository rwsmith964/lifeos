"use server";

// Server Action for the public, no-auth childcare accept/decline page
// (D-060). Deliberately does NOT check auth at all — see the
// respond_to_childcare_request() RPC comment in
// supabase/migrations/20260828000002_childcare_providers_and_requests.sql
// for why: the provider is very often not a LifeOS account holder, so
// there's no session to check against in the first place. The 128-bit
// token in the URL is the entire security boundary here, same trust model
// as a "click to RSVP" link.

import { createSupabaseServerClient } from "@/lib/db/client-server";
import { respondToChildcareRequest } from "@/lib/db/repositories/childcare";

export interface RespondState {
  error: string | null;
  status: "accepted" | "declined" | null;
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

function isPostgrestLikeError(error: unknown): error is PostgrestLikeError {
  return typeof error === "object" && error !== null && "code" in error;
}

// respond_to_childcare_request() raises distinct SQLSTATE codes — mirrors
// app/invite/[token]/actions.ts's INVITE_ERROR_MESSAGES mapping.
const RESPOND_ERROR_MESSAGES: Record<string, string> = {
  P0002: "That request link isn't valid.",
  "22023": "That request has already been responded to, cancelled, or has expired.",
};

export async function respondToChildcareRequestAction(
  token: string,
  response: "accepted" | "declined"
): Promise<RespondState> {
  const supabase = await createSupabaseServerClient();
  try {
    const updated = await respondToChildcareRequest(supabase, token, response);
    return { error: null, status: updated.status === "declined" ? "declined" : "accepted" };
  } catch (error) {
    console.error("Childcare request response failed:", error);
    const code = isPostgrestLikeError(error) ? error.code : undefined;
    return {
      error: (code && RESPOND_ERROR_MESSAGES[code]) ?? "Couldn't submit that response — please try again.",
      status: null,
    };
  }
}
