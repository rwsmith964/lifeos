"use client";

import { useRef } from "react";
import { useFormPost } from "@/lib/hooks/use-form-post";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import { TRIP_TYPE_LABELS } from "@/lib/ai/prompts/packing-checklist";
import type { PersonRow, TripType } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// D-139 (packing_checklist_v2, roadmap R-2). The wizard's step-1 form:
// enough context (trip type, dates, destination, who's going, what you'll
// be doing) for lib/packing/generate.ts to produce a useful checklist on
// the next step, entered as a plain create form -- same shape as
// ../activities/trip-idea-form.tsx.
const TRIP_TYPE_OPTIONS = Object.entries(TRIP_TYPE_LABELS) as [TripType, string][];

export function PackingListForm({ travelers }: { travelers: PersonRow[] }) {
  const { submit, pending, error, errorField, clearErrorField } = useFormPost("/api/packing-lists");
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);

  function handleSave() {
    if (!checkValid()) return;
    submit(new FormData(formRef.current!), {
      redirectTo: (data) => `/packing/${data.id}`,
    });
  }

  const fieldError = (name: string) => (errorField === name ? error : null);

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Trip name</Label>
        <Input
          id="title"
          name="title"
          placeholder="e.g. Oregon Coast weekend"
          required
          aria-invalid={!!fieldError("title") || undefined}
          onChange={() => clearErrorField("title")}
        />
        {fieldError("title") && <p className="text-xs text-destructive">{fieldError("title")}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tripType">Trip type</Label>
        <select
          id="tripType"
          name="tripType"
          defaultValue="other"
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {TRIP_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="startDate">Start date (optional)</Label>
          <Input id="startDate" name="startDate" type="date" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="endDate">End date (optional)</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            aria-invalid={!!fieldError("endDate") || undefined}
            onChange={() => clearErrorField("endDate")}
          />
          {fieldError("endDate") && <p className="text-xs text-destructive">{fieldError("endDate")}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="destination">Destination (optional)</Label>
        <Input id="destination" name="destination" placeholder="e.g. Cannon Beach, OR" />
      </div>

      {travelers.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Who&apos;s going?</Label>
          <div className="flex flex-col gap-1">
            {travelers.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="travelerPersonIds" value={person.id} defaultChecked />
                {person.full_name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="plannedActivities">What will you be doing? (optional)</Label>
        <Textarea
          id="plannedActivities"
          name="plannedActivities"
          placeholder="e.g. hiking, one nice dinner out, a day at the beach"
        />
        <p className="text-xs text-muted-foreground">
          The more specific you are here, the more tailored the generated checklist will be.
        </p>
      </div>

      {invalid && <p className="text-sm text-destructive">Please fill in the required fields above.</p>}
      {error && !errorField && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSave} disabled={pending}>
        {pending ? "Saving…" : "Create packing list"}
      </Button>
    </form>
  );
}
