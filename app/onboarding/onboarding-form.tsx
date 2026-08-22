"use client";

import { useActionState } from "react";
import { createHouseholdAction, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const initialState: OnboardingState = { error: null };

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(createHouseholdAction, initialState);

  return (
    <Card className="w-full max-w-sm">
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Your full name</Label>
            <Input id="fullName" name="fullName" defaultValue={defaultName} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="householdName">Household name</Label>
            <Input id="householdName" name="householdName" placeholder="e.g. Smith Household" required />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Setting up…" : "Get started"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
