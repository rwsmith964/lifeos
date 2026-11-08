"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { respondToInvitation } from "@/lib/db/repositories/event-invitations";

export interface RsvpResult {
  error: string | null;
}

/** Public RSVP: the token in the emailed link is the credential, no account needed. */
export async function rsvpAction(token: string, status: "accepted" | "declined" | "maybe"): Promise<RsvpResult> {
  if (!z.string().uuid().safeParse(token).success || !["accepted", "declined", "maybe"].includes(status)) {
    return { error: "That invitation link isn't valid." };
  }
  try {
    const supabase = await createSupabaseServerClient();
    await respondToInvitation(supabase, token, status);
  } catch (error) {
    console.error("RSVP failed:", error);
    return { error: "Couldn't save your answer — please try again." };
  }
  revalidatePath(`/rsvp/${token}`);
  return { error: null };
}
