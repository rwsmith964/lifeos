"use client";

import { useRef, useState } from "react";
import { useFormPost } from "@/lib/hooks/use-form-post";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EVENT_TYPES = ["personal", "work", "family", "kid_activity", "custody", "prep", "travel"] as const;
const VISIBILITY_OPTIONS = ["private", "household", "shared_with_coparent"] as const;

// "End time must be after the start time" is the only server-side error
// this form can produce that concerns a specific field rather than the
// whole form — placed under End, and dismissed as soon as either time
// changes, rather than sitting there (unclearable) until the next submit.
function isTimeRangeError(message: string): boolean {
  return /start time|starts_at/i.test(message);
}

// Shared by both /calendar/new and /calendar/[id]/edit (D-056) — same
// fields, same validation, same submit plumbing via useFormPost; only the
// endpoint/method/defaults/redirect differ between create and edit.
export interface EventFormDefaults {
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  eventType: string;
  visibility: string;
  attendeePersonIds: string[];
}

interface EventFormProps {
  people: PersonRow[];
  endpoint: string;
  method?: "POST" | "PATCH";
  redirectTo: (date: string) => string;
  submitLabel: string;
  pendingLabel: string;
  defaults?: Partial<EventFormDefaults>;
}

export function EventForm({ people, endpoint, method, redirectTo, submitLabel, pendingLabel, defaults }: EventFormProps) {
  const { submit, pending, error } = useFormPost(endpoint);
  const [allDay, setAllDay] = useState(defaults?.allDay ?? false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const attendeeSet = new Set(defaults?.attendeePersonIds ?? []);

  function handleSave() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    setErrorDismissed(false);
    const formData = new FormData(formRef.current);
    const savedDate = String(formData.get("date") ?? "");
    submit(formData, { method, redirectTo: () => redirectTo(savedDate) });
  }

  const timeRangeError = error && isTimeRangeError(error) && !errorDismissed ? error : null;
  const otherError = error && !isTimeRangeError(error) ? error : null;

  return (
    <form ref={formRef} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required defaultValue={defaults?.title} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" required defaultValue={defaults?.date} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All
        day
      </label>
      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="startTime">Start</Label>
            <Input
              id="startTime"
              name="startTime"
              type="time"
              defaultValue={defaults?.startTime ?? "09:00"}
              onChange={() => setErrorDismissed(true)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="endTime">End</Label>
            <Input
              id="endTime"
              name="endTime"
              type="time"
              defaultValue={defaults?.endTime ?? "10:00"}
              aria-invalid={!!timeRangeError || undefined}
              onChange={() => setErrorDismissed(true)}
            />
            {timeRangeError && <p className="text-xs text-destructive">{timeRangeError}</p>}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Location (optional)</Label>
        <Input id="location" name="location" defaultValue={defaults?.location} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="eventType">Type</Label>
        <select
          id="eventType"
          name="eventType"
          defaultValue={defaults?.eventType ?? "personal"}
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="visibility">Visibility</Label>
        <select
          id="visibility"
          name="visibility"
          defaultValue={defaults?.visibility ?? "private"}
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          {VISIBILITY_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {people.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Who&apos;s involved</Label>
          <div className="flex flex-col gap-1">
            {people.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="attendeePersonIds"
                  value={person.id}
                  defaultChecked={attendeeSet.has(person.id)}
                />
                {person.full_name}
              </label>
            ))}
          </div>
        </div>
      )}

      {otherError && <p className="text-sm text-destructive">{otherError}</p>}
      <Button type="button" onClick={handleSave} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
