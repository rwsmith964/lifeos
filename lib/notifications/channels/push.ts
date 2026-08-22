// Push channel — v2 (Section 10.3: "requires the Expo shell"). This is the
// no-op implementation the spec asks to build now so device_tokens and the
// dispatcher contract are ready; swapping in a real Expo push send later
// touches only this file.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelAdapter, ChannelDeliveryResult, NotificationPayload } from "../types";

async function send(_client: SupabaseClient, _payload: NotificationPayload): Promise<ChannelDeliveryResult> {
  return { delivered: false, detail: "push notifications are not implemented until the Expo shell (v2)" };
}

export const pushChannel: ChannelAdapter = { channel: "push", send };
