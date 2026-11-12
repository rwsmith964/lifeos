"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { AI_CONSENT_METADATA_KEY, buildStoredAiConsent } from "@/lib/ai/consent";

export interface AiConsentActionState {
  error: string | null;
}

/** Records the signed-in person's answer to the "share data with the AI provider?" question. */
export async function setAiConsentAction(choice: "granted" | "declined"): Promise<AiConsentActionState> {
  if (choice !== "granted" && choice !== "declined") return { error: "Choose Agree or Not now." };
  const { supabase } = await requireHouseholdContext();
  const { error } = await supabase.auth.updateUser({
    data: { [AI_CONSENT_METADATA_KEY]: buildStoredAiConsent(choice) },
  });
  if (error) return { error: "We couldn't save your choice. Please try again." };
  // The consent screen lives in the layout, so refresh everything.
  revalidatePath("/", "layout");
  return { error: null };
}
