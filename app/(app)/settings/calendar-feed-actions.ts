"use server";

// Server Actions for the Settings > Calendar feeds section (P3-6:
// calendar import). Mirrors household-invite-actions.ts's structure
// (owner/adult guard, friendlyMutationError, revalidatePath) since this
// is the same shape of feature: a household-scoped list with an
// add/manage/remove flow gated to owner/adult.

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listMembersOfHousehold } from "@/lib/db/repositories/households";
import {
  calendarFeedsRepo,
  deleteImportedEventsForFeed,
} from "@/lib/db/repositories/calendar";
import { calendarFeedInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { externalSourceForFeed } from "@/lib/calendar/ics-import";
import { syncCalendarFeed } from "@/lib/calendar/feed-sync";

async function requireOwnerOrAdult() {
  const ctx = await requireHouseholdContext();
  const members = await listMembersOfHousehold(ctx.supabase, ctx.household.id);
  const selfMembership = members.find((m) => m.user_id === ctx.userId);
  if (!selfMembership || (selfMembership.role !== "owner" && selfMembership.role !== "adult")) {
    throw new Error("Only household owners and adults can manage connected calendars.");
  }
  return ctx;
}

export interface CalendarFeedFormState {
  error: string | null;
  added: boolean;
}

export async function addCalendarFeedAction(
  _prevState: CalendarFeedFormState,
  formData: FormData
): Promise<CalendarFeedFormState> {
  let ctx;
  try {
    ctx = await requireOwnerOrAdult();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed.", added: false };
  }
  const { supabase, household, selfPerson } = ctx;

  const parsed = calendarFeedInsertSchema.safeParse({
    household_id: household.id,
    created_by_person_id: selfPerson.id,
    label: String(formData.get("label") ?? ""),
    feed_url: String(formData.get("feed_url") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", added: false };
  }

  let feed;
  try {
    feed = await calendarFeedsRepo.create(supabase, parsed.data);
  } catch (error) {
    return {
      error: friendlyMutationError(error, { fallback: "Couldn't add that calendar -- please try again." }),
      added: false,
    };
  }

  // Sync immediately so the person adding it sees real results (or a
  // clear error) right away instead of waiting for tomorrow's cron.
  await syncCalendarFeed(supabase, feed);

  revalidatePath("/settings");
  return { error: null, added: true };
}

export interface CalendarFeedMutationState {
  error: string | null;
}

export async function syncCalendarFeedNowAction(feedId: string): Promise<CalendarFeedMutationState> {
  const ctx = await requireHouseholdContext();
  const feed = await calendarFeedsRepo.getById(ctx.supabase, feedId);
  if (!feed || feed.household_id !== ctx.household.id) {
    return { error: "That calendar wasn't found." };
  }
  const result = await syncCalendarFeed(ctx.supabase, feed);
  revalidatePath("/settings");
  return { error: result.ok ? null : result.error };
}

export async function deleteCalendarFeedAction(feedId: string): Promise<CalendarFeedMutationState> {
  let ctx;
  try {
    ctx = await requireOwnerOrAdult();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }
  const feed = await calendarFeedsRepo.getById(ctx.supabase, feedId);
  if (!feed || feed.household_id !== ctx.household.id) {
    return { error: "That calendar wasn't found." };
  }
  try {
    await deleteImportedEventsForFeed(ctx.supabase, ctx.household.id, externalSourceForFeed(feed.id));
    await calendarFeedsRepo.remove(ctx.supabase, feedId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that calendar." }) };
  }
  revalidatePath("/settings");
  return { error: null };
}
