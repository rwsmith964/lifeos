"use client";

import {
  AddChildActivityForm,
  AddInterestForm,
  AddWorkScheduleForm,
  SuggestedInterestBubbles,
} from "@/app/(app)/people/[id]/person-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OnboardingPerson } from "./types";

// D-141: one screen per household member (per ROADMAP-PROACTIVE-ASSISTANT.md
// R-3's "likely a multi-step wizard, one screen per household member").
// Reuses the exact same form components /people/[id] already ships —
// AddWorkScheduleForm, AddChildActivityForm, AddInterestForm,
// SuggestedInterestBubbles (D-137) — so there's no parallel onboarding-only
// copy of any of this logic; adding a shift or interest here writes through
// the same repos/Server Actions a later edit from the People page would.
// Every field here is optional — Back/Next are always enabled, since this
// is a first pass at getting a household started, not a hard gate.
export function PersonDetailStep({
  person,
  stepLabel,
  isLast,
  onBack,
  onNext,
}: {
  person: OnboardingPerson;
  stepLabel: string;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const isChild = person.relationshipType === "child";

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{stepLabel}</p>
          <h2 className="text-lg font-semibold">Tell us about {person.fullName}</h2>
          <p className="text-sm text-muted-foreground">
            {isChild
              ? "Add any recurring activities — practice, lessons, clubs. You can skip this and add it later."
              : "Add a recurring work schedule if they have one. You can skip this and add it later."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {isChild ? (
            <AddChildActivityForm childPersonId={person.id} />
          ) : (
            <AddWorkScheduleForm personId={person.id} />
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-sm font-medium">What does {person.fullName} enjoy?</p>
          <SuggestedInterestBubbles
            personId={person.id}
            birthdate={person.birthdate}
            birthYearKnown={person.birthYearKnown}
            relationshipType={person.relationshipType}
            existingInterests={[]}
          />
          <AddInterestForm personId={person.id} />
        </div>

        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="button" onClick={onNext}>
            {isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
