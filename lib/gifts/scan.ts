// The daily occasion scan job (Section 7.1, 7.2). For every household:
// finds upcoming occasions within the configured horizon, generates
// suggestions for any that don't have them yet, and dispatches a
// notification for any suggestion whose prompt window has just opened
// (order-by date minus the configurable buffer — Section 7.2, "the prompt
// appears when action is actually needed").
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { isPastPromptDate } from "./leadtime";
import { scanUpcomingOccasions } from "./occasions";
import { generateGiftSuggestions } from "./suggest";
import { householdsRepo } from "../db/repositories/households";
import { listPeopleForHousehold } from "../db/repositories/people";
import { giftSuggestionsRepo } from "../db/repositories/gifts";
import { notificationsRepo } from "../db/repositories/system";
import { dispatchNotification } from "../notifications/dispatch";

export interface ScanHouseholdResult {
  suggestionsGenerated: number;
  notificationsSent: number;
}

export async function scanHouseholdForGiftOccasions(
  client: SupabaseClient,
  householdId: string,
  today: Date = new Date()
): Promise<ScanHouseholdResult> {
  const household = await householdsRepo.getById(client, householdId);
  if (!household) throw new Error(`Household ${householdId} not found`);

  const people = await listPeopleForHousehold(client, householdId);
  const occasions = scanUpcomingOccasions(people, today, household.gift_scan_horizon_days);

  // Reminders go to the household's own account holder ("self"), never to
  // the gift recipient — the whole point of the gift engine is surprises,
  // and gift_suggestions is already owner/adult-only in RLS (D-007) for
  // exactly this reason.
  const shopper = people.find((p) => p.relationship_type === "self");

  let suggestionsGenerated = 0;
  for (const occasion of occasions) {
    const occasionDateStr = format(occasion.occasionDate, "yyyy-MM-dd");
    const existing = await giftSuggestionsRepo.list(client, (q) =>
      q
        .eq("person_id", occasion.personId)
        .eq("occasion_type", occasion.occasionType)
        .eq("occasion_date", occasionDateStr)
    );
    if (existing.length > 0) continue;

    const result = await generateGiftSuggestions(client, {
      householdId,
      personId: occasion.personId,
      occasionType: occasion.occasionType,
      occasionDate: occasion.occasionDate,
    });
    if (result.status === "generated") suggestionsGenerated += result.suggestions.length;
  }

  const dueSuggestions = await giftSuggestionsRepo.list(client, (q) =>
    q.in("status", ["suggested", "saved"])
  );

  let notificationsSent = 0;
  if (shopper) {
    for (const suggestion of dueSuggestions) {
      const orderByDate = new Date(suggestion.order_by_date);
      if (!isPastPromptDate(orderByDate, household.gift_prompt_buffer_days, today)) continue;

      const linkPath = `/gifts/suggestions/${suggestion.id}`;
      const alreadyNotified = await notificationsRepo.list(client, (q) =>
        q.eq("notification_type", "gift_order_by").eq("link_path", linkPath).limit(1)
      );
      if (alreadyNotified.length > 0) continue;

      await dispatchNotification(
        client,
        {
          householdId,
          personId: shopper.id,
          notificationType: "gift_order_by",
          title: `Order by ${suggestion.order_by_date}: ${suggestion.title}`,
          body: suggestion.reasoning,
          linkPath,
        },
        ["in_app", "email"]
      );
      notificationsSent++;
    }
  }

  return { suggestionsGenerated, notificationsSent };
}
