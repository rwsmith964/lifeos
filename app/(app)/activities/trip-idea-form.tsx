"use client";

import { useRef } from "react";
import { useFormPost } from "@/lib/hooks/use-form-post";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// D-059: someday/bucket-list bigger trips. Shared by /activities/trips/new
// and /activities/trips/[id]/edit — same fields/plumbing pattern as
// ../activity-form.tsx.
export interface TripIdeaFormDefaults {
  title: string;
  activityType: string;
  description: string;
  targetTimeframe: string;
  companionPersonIds: string[];
  status: string;
}

interface TripIdeaFormProps {
  possibleCompanions: PersonRow[];
  endpoint: string;
  method?: "POST" | "PATCH";
  redirectTo: string;
  submitLabel: string;
  pendingLabel: string;
  defaults?: Partial<TripIdeaFormDefaults>;
}

const STATUS_OPTIONS = [
  { value: "idea", label: "Someday idea" },
  { value: "planned", label: "Planned" },
  { value: "booked", label: "Booked" },
  { value: "done", label: "Done" },
  { value: "abandoned", label: "Abandoned" },
];

export function TripIdeaForm({
  possibleCompanions,
  endpoint,
  method,
  redirectTo,
  submitLabel,
  pendingLabel,
  defaults,
}: TripIdeaFormProps) {
  const { submit, pending, error, errorField, clearErrorField } = useFormPost(endpoint);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSave() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    submit(new FormData(formRef.current), { method, redirectTo: () => redirectTo });
  }

  const fieldError = (name: string) => (errorField === name ? error : null);
  const d = defaults ?? ({} as Partial<TripIdeaFormDefaults>);
  const companionSet = new Set(d.companionPersonIds ?? []);

  return (
    <form ref={formRef} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Trip idea</Label>
        <Input
          id="title"
          name="title"
          placeholder="e.g. Alaska fishing trip"
          required
          defaultValue={d.title}
          aria-invalid={!!fieldError("title") || undefined}
          onChange={() => clearErrorField("title")}
        />
        {fieldError("title") && <p className="text-xs text-destructive">{fieldError("title")}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="activityType">Related activity (optional)</Label>
        <Input id="activityType" name="activityType" placeholder="fishing" defaultValue={d.activityType} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="targetTimeframe">Target timeframe (optional)</Label>
        <Input
          id="targetTimeframe"
          name="targetTimeframe"
          placeholder="e.g. Summer 2027, someday"
          defaultValue={d.targetTimeframe}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Notes (optional)</Label>
        <Textarea id="description" name="description" placeholder="What's the plan?" defaultValue={d.description} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          name="status"
          defaultValue={d.status ?? "idea"}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {possibleCompanions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Who would you want to go with?</Label>
          <div className="flex flex-col gap-1">
            {possibleCompanions.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="companionPersonIds"
                  value={person.id}
                  defaultChecked={companionSet.has(person.id)}
                />
                {person.full_name}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && !errorField && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSave} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
