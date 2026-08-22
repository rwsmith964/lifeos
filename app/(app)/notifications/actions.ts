"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { notificationsRepo } from "@/lib/db/repositories/system";

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await notificationsRepo.update(supabase, notificationId, { read_at: new Date().toISOString() });
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction(notificationIds: string[]): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  const now = new Date().toISOString();
  await Promise.all(notificationIds.map((id) => notificationsRepo.update(supabase, id, { read_at: now })));
  revalidatePath("/notifications");
}
