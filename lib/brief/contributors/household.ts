// Module 8 (brief_registration_v2, D-1XX) retrofitting Module 7
// (household_layer, D-123) onto the generic contributor interface --
// exactly the QUEUE-029 plan: new modules (Module 7 onward) register
// through this interface from the start, rather than getting their own
// bespoke section wired directly into app/(app)/page.tsx the way
// Opportunities (D-061) originally was.
//
// Gated twice, both required: brief_registration_v2 (this contributor
// runs at all) AND household_layer (there's anything to say). A household
// that has registration_v2 on but never turned household_layer on sees
// nothing from this file -- same "flag off, no surfaces" guarantee Module
// 7 shipped with, now also true when approached through the brief.
import { isBefore, parseISO, startOfDay } from "date-fns";
import { isFeatureEnabled } from "../../flags";
import { listChoresForHousehold, listMealPlansForRange } from "../../db/repositories/household";
import type { BriefContributor, BriefItem } from "./types";

const DINNER_GAP_PRIORITY = 40;
const CHORE_OVERDUE_PRIORITY = 80;
const CHORE_DUE_TODAY_PRIORITY = 60;

export const householdContributor: BriefContributor = async (ctx) => {
  const enabled = await isFeatureEnabled(ctx.supabase, ctx.householdId, "household_layer");
  if (!enabled) return [];

  const todayStart = startOfDay(ctx.today);
  const todayStr = todayStart.toISOString().slice(0, 10);

  const [todaysMealPlans, openChores] = await Promise.all([
    listMealPlansForRange(ctx.supabase, ctx.householdId, todayStr, todayStr),
    listChoresForHousehold(ctx.supabase, ctx.householdId, "open"),
  ]);

  const items: BriefItem[] = [];

  // Meal-plan gap: only surfaces a missing dinner, not breakfast/lunch/snack
  // -- those are frequently ad hoc and flagging every empty slot would be
  // exactly the "noisier as modules are added" the brief warns against.
  const hasDinnerPlanned = todaysMealPlans.some((plan) => plan.meal_slot === "dinner");
  if (!hasDinnerPlanned) {
    items.push({
      id: "household:dinner-gap",
      category: "household",
      priority: DINNER_GAP_PRIORITY,
      leadTimeDays: 0,
      title: "Nothing planned for dinner tonight",
      detail: "Add a recipe or a quick note to the meal plan.",
      href: "/household",
    });
  }

  for (const chore of openChores) {
    if (!chore.due_date) continue;
    const dueDate = startOfDay(parseISO(chore.due_date));
    const isOverdue = isBefore(dueDate, todayStart);
    const isDueToday = dueDate.getTime() === todayStart.getTime();
    if (!isOverdue && !isDueToday) continue;
    items.push({
      id: `household:chore:${chore.id}`,
      category: "household",
      priority: isOverdue ? CHORE_OVERDUE_PRIORITY : CHORE_DUE_TODAY_PRIORITY,
      leadTimeDays: 0,
      title: isOverdue ? `${chore.title} — overdue` : `${chore.title} — due today`,
      detail: chore.description,
      href: "/household",
    });
  }

  return items;
};
