"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { removeMealPlanSlotAction, setMealPlanSlotAction } from "./actions";
import { MEAL_SLOTS, MEAL_SLOT_LABELS } from "@/lib/household/labels";
import type { MealPlanRow, MealSlot, RecipeRow } from "@/lib/db/database.types";

export function MealPlanCard({
  days,
  plans,
  recipes,
}: {
  /** yyyy-mm-dd for each of the next 7 days, today first. */
  days: string[];
  plans: MealPlanRow[];
  recipes: RecipeRow[];
}) {
  const { showToast } = useToast();
  const [date, setDate] = useState(days[0]);
  const [slot, setSlot] = useState<MealSlot>("dinner");
  const [recipeId, setRecipeId] = useState("");
  const [customName, setCustomName] = useState("");
  const [pending, setPending] = useState(false);

  const plansByDay = useMemo(() => {
    const map = new Map<string, MealPlanRow[]>();
    for (const plan of plans) {
      const list = map.get(plan.planned_date) ?? [];
      list.push(plan);
      map.set(plan.planned_date, list);
    }
    return map;
  }, [plans]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const useRecipe = Boolean(recipeId);
    if (!useRecipe && !customName.trim()) return;
    setPending(true);
    try {
      await setMealPlanSlotAction({
        plannedDate: date,
        mealSlot: slot,
        recipeId: useRecipe ? recipeId : null,
        customMealName: useRecipe ? null : customName.trim(),
      });
      setCustomName("");
      setRecipeId("");
      showToast({ title: "Meal planned.", variant: "success" });
    } catch (err) {
      showToast({
        title: "Couldn't plan that meal",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {days.map((day) => {
          const dayPlans = plansByDay.get(day) ?? [];
          return (
            <div key={day} className="rounded-md border p-2">
              <p className="text-sm font-medium">{format(new Date(`${day}T00:00:00`), "EEEE, MMM d")}</p>
              {dayPlans.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing planned yet.</p>
              ) : (
                <div className="mt-1 flex flex-col gap-1">
                  {MEAL_SLOTS.filter((s) => dayPlans.some((p) => p.meal_slot === s)).map((s) => {
                    const plan = dayPlans.find((p) => p.meal_slot === s)!;
                    const recipe = plan.recipe_id ? recipes.find((r) => r.id === plan.recipe_id) : null;
                    return (
                      <div key={plan.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          <span className="text-muted-foreground">{MEAL_SLOT_LABELS[s]}: </span>
                          {recipe?.title ?? plan.custom_meal_name}
                        </span>
                        <ConfirmDeleteButton
                          action={async () => {
                            await removeMealPlanSlotAction(plan.id);
                          }}
                          variant="icon"
                          ariaLabel={`Clear ${MEAL_SLOT_LABELS[s].toLowerCase()} on ${day}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="mp-date">Date</Label>
          <select
            id="mp-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {format(new Date(`${day}T00:00:00`), "EEE, MMM d")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mp-slot">Meal</Label>
          <select
            id="mp-slot"
            value={slot}
            onChange={(e) => setSlot(e.target.value as MealSlot)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {MEAL_SLOTS.map((s) => (
              <option key={s} value={s}>
                {MEAL_SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mp-recipe">Recipe</Label>
          <select
            id="mp-recipe"
            value={recipeId}
            onChange={(e) => {
              setRecipeId(e.target.value);
              if (e.target.value) setCustomName("");
            }}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">— pick a recipe —</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mp-custom">Or type a meal (e.g. leftovers)</Label>
          <Input
            id="mp-custom"
            value={customName}
            onChange={(e) => {
              setCustomName(e.target.value);
              if (e.target.value) setRecipeId("");
            }}
            placeholder="leftovers, eating out, ..."
          />
        </div>
        <Button type="submit" disabled={pending || (!recipeId && !customName.trim())} size="sm">
          Plan it
        </Button>
      </form>
    </div>
  );
}
