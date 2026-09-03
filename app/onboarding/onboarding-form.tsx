"use client";

import { useActionState, useEffect, useRef } from "react";
import { createHouseholdAction, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const initialState: OnboardingState = { error: null };

// D-141: this used to redirect to "/" itself on success. It now hands the
// created self person back to <OnboardingWizard> via onCreated so the
// wizard can move on to its later steps (add household members, work
// schedule, interests) instead of dropping the user straight on the
// dashboard — see ROADMAP-PROACTIVE-ASSISTANT.md R-3.
export function OnboardingForm({
  defaultName,
  onCreated,
}: {
  defaultName: string;
  onCreated: (person: { id: string; fullName: string }) => void;
}) {
  const [state, action, pending] = useActionState(createHouseholdAction, initialState);
  const handledRef = useRef(false);

  useEffect(() => {
    if (state.selfPersonId && state.selfFullName && !handledRef.current) {
      handledRef.current = true;
      onCreated({ id: state.selfPersonId, fullName: state.selfFullName });
    }
  }, [state, onCreated]);

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
          <div className="flex flex-col gap-2">
            <Label htmlFor="birthdate">Your birthdate (optional)</Label>
            <Input id="birthdate" name="birthdate" type="date" />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="birthYearKnown" defaultChecked /> I know my birth year
            </label>
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
