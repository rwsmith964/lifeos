"use client";

import { useActionState } from "react";
import { updateHouseholdSettingsAction, type SettingsFormState } from "./actions";
import type { HouseholdRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const initialState: SettingsFormState = { error: null, saved: false };

export function SettingsForm({ household, timezone }: { household: HouseholdRow; timezone: string }) {
  const [state, action, pending] = useActionState(updateHouseholdSettingsAction, initialState);

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="householdName">Household name</Label>
            <Input id="householdName" name="householdName" defaultValue={household.name} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="budgetMin">Default gift budget min ($)</Label>
              <Input
                id="budgetMin"
                name="budgetMin"
                type="number"
                min={0}
                step={1}
                defaultValue={household.default_gift_budget_min_cents ? household.default_gift_budget_min_cents / 100 : ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="budgetMax">Default gift budget max ($)</Label>
              <Input
                id="budgetMax"
                name="budgetMax"
                type="number"
                min={0}
                step={1}
                defaultValue={household.default_gift_budget_max_cents ? household.default_gift_budget_max_cents / 100 : ""}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="briefTime">Daily brief time</Label>
            <Input id="briefTime" name="briefTime" type="time" defaultValue={household.brief_time} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" name="timezone" defaultValue={timezone} placeholder="America/Los_Angeles" />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.saved && !state.error && <p className="text-sm text-muted-foreground">Saved.</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
