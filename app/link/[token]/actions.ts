"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/client-server";

export interface AcceptLinkState {
  error: string | null;
}

const ERRORS: Record<string, string> = {
  P0002: "That invite link isn't valid.",
  "22023": "That invite has already been used, revoked, or has expired.",
  "42501": "This invite was sent to a different email address, or you aren't an adult of that household.",
  "28000": "You need to sign in first.",
};

const schema = z.object({
  token: z.string().uuid(),
  householdId: z.string().uuid(),
  personId: z.string().uuid().nullable(),
  newName: z.string().trim().max(120).nullable(),
});

export async function acceptLinkInviteAction(input: z.infer<typeof schema>): Promise<AcceptLinkState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Check the details and try again." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/link/${parsed.data.token}`)}`);

  const { error } = await supabase.rpc("accept_link_invite", {
    p_token: parsed.data.token,
    p_my_household: parsed.data.householdId,
    p_person_for_them: parsed.data.personId,
    p_new_person_name: parsed.data.personId ? null : parsed.data.newName,
  });
  if (error) {
    console.error("accept_link_invite failed:", error);
    return { error: ERRORS[error.code ?? ""] ?? "Couldn't connect — please try again." };
  }
  redirect("/settings");
}
