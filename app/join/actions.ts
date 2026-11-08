"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/client-server";

export interface JoinState {
  error: string | null;
}

const schema = z.object({
  householdId: z.string().uuid(),
  personId: z.string().uuid().nullable(),
  newName: z.string().trim().max(120).nullable(),
});

/** "Which of these people are you?" after accepting a household invite. */
export async function claimPersonAction(input: z.infer<typeof schema>): Promise<JoinState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Choose who you are, or enter your name." };
  if (!parsed.data.personId && !parsed.data.newName) return { error: "Choose who you are, or enter your name." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("claim_household_person", {
    p_household: parsed.data.householdId,
    p_person_id: parsed.data.personId,
    p_new_name: parsed.data.personId ? null : parsed.data.newName,
  });
  if (error) {
    console.error("claim_household_person failed:", error);
    return { error: "Couldn't set that up — please try again." };
  }
  redirect("/");
}
