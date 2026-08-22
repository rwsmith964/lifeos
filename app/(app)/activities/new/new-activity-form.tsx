"use client";

import { useActionState } from "react";
import { createActivityAction, type ActivityFormState } from "../actions";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActivityFormState = { error: null };

export function NewActivityForm({ possibleCompanions }: { possibleCompanions: PersonRow[] }) {
  const [state, action, pending] = useActionState(createActivityAction, initialState);

  return (
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

      {possibleCompanions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Preferred companions</Label>
          <p className="text-xs text-muted-foreground">
            The weekend planner cross-references these against who&apos;s overdue for contact.
          </p>
          <div className="flex flex-col gap-1">
            {possibleCompanions.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="preferredCompanionIds" value={person.id} />
                {person.full_name}
              </label>
            ))}
          </div>
        </div>
      )}

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
      <div className="flex flex-col gap-2">
        <Label htmlFor="usgsGauge">USGS gauge ID (optional, for river/stream conditions)</Label>
        <Input id="usgsGauge" name="usgsGauge" placeholder="e.g. 14150000" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="odfwZoneUrl">ODFW recreation report URL (optional, Oregon fishing spots)</Label>
        <Input id="odfwZoneUrl" name="odfwZoneUrl" type="url" placeholder="https://myodfw.com/recreation-report/..." />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="noaaStation">NOAA tide station ID (optional, coastal spots only)</Label>
        <Input id="noaaStation" name="noaaStation" placeholder="e.g. 9432780" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save activity"}
      </Button>
    </form>
  );
}
