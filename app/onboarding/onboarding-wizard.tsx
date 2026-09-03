"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingForm } from "./onboarding-form";
import { AddMembersStep } from "./add-members-step";
import { PersonDetailStep } from "./person-detail-step";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OnboardingPerson } from "./types";

type WizardStep = "household" | "members" | "person" | "done";

// D-141: structured onboarding questionnaire (R-3). Client-side step
// machine over three phases that each write through existing repository
// functions as they go (no drafts/no new tables — see roadmap):
//   1. "household"  — household name + self (existing flow, D-055's
//      createHouseholdWithOwner + peopleRepo.create), now returns instead
//      of redirecting so the wizard can continue.
//   2. "members"    — add any other household members via /api/people.
//   3. "person"     — one screen per person (self, then each added member)
//      for work schedule / recurring activities + interests.
//   4. "done"       — summary, then on to the dashboard.
// Every household still ends up with at least a self person even if the
// user abandons after step 1 — nothing here is more "required" than the
// single-step flow it replaces, it just offers more before dropping them
// on the dashboard.
export function OnboardingWizard({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>("household");
  const [people, setPeople] = useState<OnboardingPerson[]>([]);
  const [personIndex, setPersonIndex] = useState(0);

  const totalSteps = useMemo(() => 2 + people.length, [people.length]);

  function handleHouseholdCreated(self: { id: string; fullName: string }) {
    setPeople([{ id: self.id, fullName: self.fullName, relationshipType: "self", birthdate: null, birthYearKnown: true }]);
    setStep("members");
  }

  function handleMemberAdded(person: OnboardingPerson) {
    setPeople((prev) => [...prev, person]);
  }

  function handleContinueFromMembers() {
    setPersonIndex(0);
    setStep("person");
  }

  function handlePersonNext() {
    if (personIndex + 1 < people.length) {
      setPersonIndex((i) => i + 1);
    } else {
      setStep("done");
    }
  }

  function handlePersonBack() {
    if (personIndex > 0) {
      setPersonIndex((i) => i - 1);
    } else {
      setStep("members");
    }
  }

  if (step === "household") {
    return (
      <>
        <p className="text-xs text-muted-foreground">Step 1 of {totalSteps}</p>
        <OnboardingForm defaultName={defaultName} onCreated={handleHouseholdCreated} />
      </>
    );
  }

  if (step === "members") {
    return (
      <>
        <p className="text-xs text-muted-foreground">Step 2 of {totalSteps}</p>
        <AddMembersStep members={people.slice(1)} onAdd={handleMemberAdded} onContinue={handleContinueFromMembers} />
      </>
    );
  }

  if (step === "person") {
    const person = people[personIndex];
    if (!person) {
      setStep("done");
      return null;
    }
    return (
      <>
        <p className="text-xs text-muted-foreground">
          Step {3 + personIndex} of {totalSteps}
        </p>
        <PersonDetailStep
          person={person}
          stepLabel={`Person ${personIndex + 1} of ${people.length}`}
          isLast={personIndex + 1 === people.length}
          onBack={handlePersonBack}
          onNext={handlePersonNext}
        />
      </>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-lg font-semibold">You&apos;re all set!</h2>
        <p className="text-sm text-muted-foreground">
          {people.length === 1
            ? "Your household is ready. Add more people, schedules, and details any time from People and Settings."
            : `Your household is ready with ${people.length} people. You can always add more details from People and Settings.`}
        </p>
        <Button
          type="button"
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
        >
          Go to dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
