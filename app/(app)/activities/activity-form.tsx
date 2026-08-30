"use client";

import { useRef } from "react";
import { useFormPost } from "@/lib/hooks/use-form-post";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Shared by both /activities/new and /activities/[id]/edit (D-056) — same
// fields, same validation, same submit plumbing via useFormPost; only the
// endpoint/method/defaults/redirect differ between create and edit.
export interface ActivityFormDefaults {
  activityType: string;
  enjoymentRank: number;
  typicalDurationMinutes: number;
  requiresPrep: boolean;
  prepLeadTimeHours: number | null;
  preferredCompanionIds: string[];
  typicalDriveMinutes: number | null;
  bigTripMaxDriveMinutes: number | null;
  locationName: string;
  locationLat: number | null;
  locationLng: number | null;
  usgsGauge: string;
  odfwZoneUrl: string;
  noaaStation: string;
}

interface ActivityFormProps {
  possibleCompanions: PersonRow[];
  endpoint: string;
  method?: "POST" | "PATCH";
  redirectTo: string;
  submitLabel: string;
  pendingLabel: string;
  defaults?: Partial<ActivityFormDefaults>;
}

export function ActivityForm({
  possibleCompanions,
  endpoint,
  method,
  redirectTo,
  submitLabel,
  pendingLabel,
  defaults,
}: ActivityFormProps) {
  const { submit, pending, error, errorField, clearErrorField } = useFormPost(endpoint);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);

  function handleSave() {
    if (!checkValid()) return;
    submit(new FormData(formRef.current!), { method, redirectTo: () => redirectTo });
  }

  const fieldError = (name: string) => (errorField === name ? error : null);
  const d = defaults ?? ({} as Partial<ActivityFormDefaults>);
  const companionSet = new Set(d.preferredCompanionIds ?? []);

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="activityType">Activity</Label>
        <Input
          id="activityType"
          name="activityType"
          placeholder="golf, fishing, hiking, gym…"
          required
          defaultValue={d.activityType}
          aria-invalid={!!fieldError("activityType") || undefined}
          onChange={() => clearErrorField("activityType")}
        />
        {fieldError("activityType") && <p className="text-xs text-destructive">{fieldError("activityType")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="enjoymentRank">Enjoyment (1-10)</Label>
          <Input
            id="enjoymentRank"
            name="enjoymentRank"
            type="number"
            min={1}
            max={10}
            defaultValue={d.enjoymentRank ?? 7}
            required
            aria-invalid={!!fieldError("enjoymentRank") || undefined}
            onChange={() => clearErrorField("enjoymentRank")}
          />
          {fieldError("enjoymentRank") && <p className="text-xs text-destructive">{fieldError("enjoymentRank")}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="typicalDurationMinutes">Typical duration (min)</Label>
          <Input
            id="typicalDurationMinutes"
            name="typicalDurationMinutes"
            type="number"
            min={15}
            defaultValue={d.typicalDurationMinutes ?? 120}
            required
            aria-invalid={!!fieldError("typicalDurationMinutes") || undefined}
            onChange={() => clearErrorField("typicalDurationMinutes")}
          />
          {fieldError("typicalDurationMinutes") && (
            <p className="text-xs text-destructive">{fieldError("typicalDurationMinutes")}</p>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requiresPrep" defaultChecked={d.requiresPrep} /> Requires prep beforehand
      </label>
      <div className="flex flex-col gap-2">
        <Label htmlFor="prepLeadTimeHours">Prep lead time (hours, if any)</Label>
        <Input
          id="prepLeadTimeHours"
          name="prepLeadTimeHours"
          type="number"
          min={0}
          defaultValue={d.prepLeadTimeHours ?? undefined}
          aria-invalid={!!fieldError("prepLeadTimeHours") || undefined}
          onChange={() => clearErrorField("prepLeadTimeHours")}
        />
        {fieldError("prepLeadTimeHours") && <p className="text-xs text-destructive">{fieldError("prepLeadTimeHours")}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="typicalDriveMinutes">Typical drive time (min)</Label>
          <Input
            id="typicalDriveMinutes"
            name="typicalDriveMinutes"
            type="number"
            min={0}
            placeholder="e.g. 45"
            defaultValue={d.typicalDriveMinutes ?? undefined}
            aria-invalid={!!fieldError("typicalDriveMinutes") || undefined}
            onChange={() => clearErrorField("typicalDriveMinutes")}
          />
          {fieldError("typicalDriveMinutes") && (
            <p className="text-xs text-destructive">{fieldError("typicalDriveMinutes")}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bigTripMaxDriveMinutes">Max for a bigger trip (min)</Label>
          <Input
            id="bigTripMaxDriveMinutes"
            name="bigTripMaxDriveMinutes"
            type="number"
            min={0}
            placeholder="e.g. 90"
            defaultValue={d.bigTripMaxDriveMinutes ?? undefined}
            aria-invalid={!!fieldError("bigTripMaxDriveMinutes") || undefined}
            onChange={() => clearErrorField("bigTripMaxDriveMinutes")}
          />
          {fieldError("bigTripMaxDriveMinutes") && (
            <p className="text-xs text-destructive">{fieldError("bigTripMaxDriveMinutes")}</p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Typical is how far you&apos;d normally drive for this. The bigger-trip max is how far you&apos;d go for a
        specifically great outing.
      </p>

      {possibleCompanions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Preferred companions</Label>
          <p className="text-xs text-muted-foreground">
            The weekend planner cross-references these against who&apos;s overdue for contact.
          </p>
          <div className="flex flex-col gap-1">
            {possibleCompanions.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="preferredCompanionIds"
                  value={person.id}
                  defaultChecked={companionSet.has(person.id)}
                />
                {person.full_name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="locationName">Usual location (optional)</Label>
        <Input id="locationName" name="locationName" placeholder="e.g. Dexter Reservoir" defaultValue={d.locationName} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="locationLat">Latitude</Label>
          <Input id="locationLat" name="locationLat" type="number" step="any" defaultValue={d.locationLat ?? undefined} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="locationLng">Longitude</Label>
          <Input id="locationLng" name="locationLng" type="number" step="any" defaultValue={d.locationLng ?? undefined} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="usgsGauge">USGS gauge ID (optional, for river/stream conditions)</Label>
        <Input id="usgsGauge" name="usgsGauge" placeholder="e.g. 14150000" defaultValue={d.usgsGauge} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="odfwZoneUrl">ODFW recreation report URL (optional, Oregon fishing spots)</Label>
        <Input
          id="odfwZoneUrl"
          name="odfwZoneUrl"
          type="url"
          placeholder="https://myodfw.com/recreation-report/..."
          defaultValue={d.odfwZoneUrl}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="noaaStation">NOAA tide station ID (optional, coastal spots only)</Label>
        <Input id="noaaStation" name="noaaStation" placeholder="e.g. 9432780" defaultValue={d.noaaStation} />
      </div>

      {invalid && <p className="text-sm text-destructive">Please fill in the required fields above.</p>}
      {error && !errorField && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSave} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
