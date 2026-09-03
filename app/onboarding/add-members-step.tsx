"use client";

import { useRef } from "react";
import { useFormPost } from "@/lib/hooks/use-form-post";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OnboardingPerson } from "./types";

// D-141: same relationship list as /people/new and the person edit form
// (self excluded — self was already created in step 1). Duplicated locally
// rather than imported, matching the existing precedent of this exact list
// appearing per-file (edit-person-form.tsx, people/new/page.tsx).
const RELATIONSHIP_OPTIONS = [
  "child",
  "spouse",
  "partner",
  "co_parent",
  "parent",
  "sibling",
  "extended_family",
  "friend",
  "colleague",
  "other",
] as const;

// Reuses the existing POST /api/people Route Handler (D-031: Route Handler
// rather than Server Action for record creation) — the same endpoint
// /people/new already submits to, so there's no parallel person-creation
// path just for onboarding.
export function AddMembersStep({
  members,
  onAdd,
  onContinue,
}: {
  members: OnboardingPerson[];
  onAdd: (person: OnboardingPerson) => void;
  onContinue: () => void;
}) {
  const { submit, pending, error } = useFormPost("/api/people");
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);

  function handleAdd() {
    if (!checkValid()) return;
    const form = formRef.current!;
    const formData = new FormData(form);
    const fullName = String(formData.get("fullName") ?? "").trim();
    const relationshipType = String(formData.get("relationshipType") ?? "friend") as OnboardingPerson["relationshipType"];
    const birthdate = String(formData.get("birthdate") ?? "").trim() || null;
    const birthYearKnown = formData.get("birthYearKnown") === "on";

    submit(formData, {
      onSuccess: (data) => {
        onAdd({
          id: String(data.id),
          fullName,
          relationshipType,
          birthdate,
          birthYearKnown,
        });
        form.reset();
      },
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Who else is in your household?</h2>
          <p className="text-sm text-muted-foreground">
            Add a spouse, kids, or anyone else you want to keep organized. You can always add more later.
          </p>
        </div>

        {members.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <Badge key={m.id} variant="secondary">
                {m.fullName} · {m.relationshipType.replace("_", " ")}
              </Badge>
            ))}
          </div>
        )}

        <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="relationshipType">Relationship</Label>
            <select
              id="relationshipType"
              name="relationshipType"
              defaultValue="child"
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            >
              {RELATIONSHIP_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="birthdate">Birthdate (optional)</Label>
            <Input id="birthdate" name="birthdate" type="date" />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="birthYearKnown" defaultChecked /> I know their birth year
            </label>
          </div>
          {invalid && <p className="text-sm text-destructive">A name is required.</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="button" variant="secondary" onClick={handleAdd} disabled={pending}>
            {pending ? "Adding…" : "Add person"}
          </Button>
        </form>

        <Button type="button" onClick={onContinue}>
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
