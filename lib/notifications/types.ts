// Notification dispatcher architecture (Section 10.1): "channel-agnostic
// dispatcher takes a notification object and a channel list, delegates to
// per-channel adapters. Adding a channel later must not touch calling
// code." This file is the contract every channel/*.ts implements and the
// only thing lib/notifications/dispatch.ts depends on.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationChannel } from "../db/database.types";

export interface NotificationPayload {
  householdId: string;
  personId: string;
  notificationType: string; // 'daily_brief' | 'gift_order_by' | 'contact_overdue' | ...
  title: string;
  body: string;
  linkPath?: string | null;
}

export interface ChannelDeliveryResult {
  delivered: boolean;
  detail?: string;
}

export interface ChannelAdapter {
  channel: NotificationChannel;
  send(client: SupabaseClient, payload: NotificationPayload): Promise<ChannelDeliveryResult>;
}
