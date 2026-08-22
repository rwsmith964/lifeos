// SMS channel — deferred (Section 10.4: A2P 10DLC registration takes weeks
// and carries per-message cost; the lead time, not the code, is the binding
// constraint). No-op implementation now; see QUESTIONS.md Q-003 for whether
// to start registration in parallel.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelAdapter, ChannelDeliveryResult, NotificationPayload } from "../types";

async function send(_client: SupabaseClient, _payload: NotificationPayload): Promise<ChannelDeliveryResult> {
  return { delivered: false, detail: "SMS is deferred pending A2P 10DLC registration (Section 10.4)" };
}

export const smsChannel: ChannelAdapter = { channel: "sms", send };
