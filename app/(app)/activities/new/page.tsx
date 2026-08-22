"use client";

import { useActionState } from "react";
import { createActivityAction, type ActivityFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActivityFormState = { error: null };

export default function NewActivityPage() {
  const [state, action, pending] = useActionState(createActivityAction, initialState);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add an activity</h1>
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="activityType">Activity</Label>
          <Input id="activityType" name="activityType" placeholder="golf, fishing, hiking, gym…" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="enjoymentRank">Enjoyment (1-10)</Label>
            <Input id="enjoymentRank" name="enjoymentRank" type="number" min={1} max={10} defaultValue={7} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="typicalDurationMinutes">Typical duration (min)</Label>
            <Input
              id="typicalDurationMinutes"
              name="typicalDurationMinutes"
              type="number"
              min={15}
              defaultValue={120}
              required
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="requiresPrep" /> Requires prep beforehand
        </label>
        <div className="flex flex-col gap-2">
          <Label htmlFor="prepLeadTimeHours">Prep lead time (hours, if any)</Label>
          <Input id="prepLeadTimeHours" name="prepLeadTimeHours" type="number" min={0} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="locationName">Usual location (optional)</Label>
          <Input id="locationName" name="locationName" placeholder="e.g. Dexter Reservoir" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="locationLat">Latitude</Label>
            <Input id="locationLat" name="locationLat" type="number" step="any" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="locationLng">Longitude</Label>
            <Input id="locationLng" name="locationLng" type="number" step="any" />
          </div>
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save activity"}
        </Button>
      </form>
    </div>
  );
}
