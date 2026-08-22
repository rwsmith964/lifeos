// Notification dispatcher (Section 10.1). Adding a channel later means
// adding one entry to CHANNELS_BY_NAME — no calling code changes.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationChannel } from "../db/database.types";
import { inAppChannel } from "./channels/in-app";
import { emailChannel } from "./channels/email";
import { pushChannel } from "./channels/push";
import { smsChannel } from "./channels/sms";
import type { ChannelAdapter, ChannelDeliveryResult, NotificationPayload } from "./types";

const CHANNELS_BY_NAME: Record<NotificationChannel, ChannelAdapter> = {
  in_app: inAppChannel,
  email: emailChannel,
  push: pushChannel,
  sms: smsChannel,
};

export interface DispatchResult {
  channel: NotificationChannel;
  result: ChannelDeliveryResult;
}

export async function dispatchNotification(
  client: SupabaseClient,
  payload: NotificationPayload,
  channels: NotificationChannel[]
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];
  for (const channel of channels) {
    const adapter = CHANNELS_BY_NAME[channel];
    try {
      const result = await adapter.send(client, payload);
      results.push({ channel, result });
    } catch (error) {
      results.push({
        channel,
        result: { delivered: false, detail: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return results;
}
