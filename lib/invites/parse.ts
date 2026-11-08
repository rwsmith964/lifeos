import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { callAi } from "../ai/client";
import { parseAiJson } from "../ai/parse-json";
import { getZonedNow } from "../timezones";
import { INVITE_SYSTEM_PROMPT, buildInviteUserPrompt, inviteExtractionSchema, type InviteExtraction } from "./extraction";

export type InviteMediaType = "image/png" | "image/jpeg" | "image/webp";

/** Reads an invitation photo. Throws on unreadable output; AiUnavailableError /
 * AiBudgetExceededError propagate for the caller to turn into a friendly message. */
export async function parseInviteImage(
  supabase: SupabaseClient,
  householdId: string,
  base64Data: string,
  mediaType: InviteMediaType,
  timezone: string
): Promise<InviteExtraction> {
  const today = format(getZonedNow(timezone), "yyyy-MM-dd");
  const result = await callAi(supabase, {
    householdId,
    timezone,
    feature: "invite_photo",
    systemPrompt: INVITE_SYSTEM_PROMPT,
    userPrompt: buildInviteUserPrompt(today),
    maxTokens: 1024,
    attachment: { base64Data, mediaType },
  });

  const parsed = parseAiJson(result.text);
  if (!parsed.success) throw new Error("Invite reader returned unparseable output");
  const validated = inviteExtractionSchema.safeParse(parsed.data);
  if (!validated.success) throw new Error("Invite reader output didn't match the expected shape");
  return validated.data;
}
