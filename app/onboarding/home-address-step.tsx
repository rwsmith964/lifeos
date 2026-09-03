"use client";

import { useActionState, useEffect, useRef } from "react";
import { setOnboardingHomeAddressAction, type OnboardingAddressState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const initialState: OnboardingAddressState = { error: null, saved: false };

// D-152: companion to the AddMembersStep / PersonDetailStep pattern —
// optional, skippable, and doesn't block reaching the dashboard. Unlike
// those steps this one has nothing to add repeatedly (a household has
// exactly one home address), so there's no "add another" affordance, just
// Save-and-continue or Skip.
export function HomeAddressStep({ onDone }: { onDone: () => void }) {
  const [state, dispatch, pending] = useActionState(setOnboardingHomeAddressAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (state.saved && !state.error && !handledRef.current) {
      handledRef.current = true;
      onDone();
    }
  }, [state, onDone]);

  function handleSave() {
    dispatch(new FormData(formRef.current!));
  }

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Where&apos;s home?</h2>
          <p className="text-sm text-muted-foreground">
            Add your home address to unlock weekend-plan suggestions and the weather in your daily brief. You can
            always add or change this later in Settings.
          </p>
        </div>

        <form ref={formRef} className="flex flex-col gap-2">
          <Label htmlFor="homeAddress">Home address</Label>
          <Input id="homeAddress" name="homeAddress" placeholder="e.g. 123 Main St, Eugene, OR" />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </form>

        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Skip for now
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending} className="flex-1">
            {pending ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
