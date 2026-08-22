// In-app channel (Section 10.2) — writes a row to `notifications`, which
// backs the notification center's unread state.
import { notificationsRepo } from "../../db/repositories/system";
import type { ChannelAdapter, ChannelDeliveryResult, NotificationPayload } from "../types";
import type { SupabaseClient } from "@supabase/supabase-js";

async function send(client: SupabaseClient, payload: NotificationPayload): Promise<ChannelDeliveryResult> {
  await notificationsRepo.create(client, {
    household_id: payload.householdId,
    person_id: payload.personId,
    notification_type: payload.notificationType,
    title: payload.title,
    body: payload.body,
    link_path: payload.linkPath ?? null,
    channels: ["in_app"],
  });
  return { delivered: true };
}

export const inAppChannel: ChannelAdapter = { channel: "in_app", send };
