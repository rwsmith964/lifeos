"use client";

import { useActionState, useState } from "react";
import { createCalendarEventAction, type CalendarEventFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CalendarEventFormState = { error: null };

const EVENT_TYPES = ["personal", "work", "family", "kid_activity", "custody", "prep", "travel"] as const;
const VISIBILITY_OPTIONS = ["private", "household", "shared_with_coparent"] as const;

export default function NewCalendarEventPage() {
  const [state, action, pending] = useActionState(createCalendarEventAction, initialState);
  const [allDay, setAllDay] = useState(false);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add event</h1>
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" required />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All
          day
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startTime">Start</Label>
              <Input id="startTime" name="startTime" type="time" defaultValue="09:00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endTime">End</Label>
              <Input id="endTime" name="endTime" type="time" defaultValue="10:00" />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="location">Location (optional)</Label>
          <Input id="location" name="location" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="eventType">Type</Label>
          <select
            id="eventType"
            name="eventType"
            defaultValue="personal"
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
            defaultValue="private"
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {VISIBILITY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save event"}
        </Button>
      </form>
    </div>
  );
}
