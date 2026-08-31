"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, MapPin } from "lucide-react";
import { addActivityLocationAction, removeActivityLocationAction, type SimpleFormState } from "./actions";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActivityLocationRow } from "@/lib/db/database.types";

const initialState: SimpleFormState = { error: null };

/**
 * D-095 (P3-2): "one activity, many locations" (Shooting was already
 * modelled this way; golf was two separate activities before this). The
 * main ActivityForm's "Usual location" fields keep managing locations[0]
 * exactly as before (unchanged, still through the POST/PATCH route) — this
 * section is additive and only handles any *other* locations for the same
 * activity, so an activity that happens at two courses/ranges/spots can
 * have both without duplicating the whole activity.
 */
export function ActivityLocationsSection({
  activityId,
  additionalLocations,
}: {
  activityId: string;
  additionalLocations: ActivityLocationRow[];
}) {
  const action = addActivityLocationAction.bind(null, activityId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);

  // Same proven pattern as AddInterestForm (D-032): clear the fields after a
  // successful add so a second click can't accidentally double-add.
  useEffect(() => {
    if (justSubmittedRef.current && !state.error) {
      formRef.current?.reset();
    }
    justSubmittedRef.current = false;
  }, [state]);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    dispatch(new FormData(formRef.current!));
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div>
        <Label>Other locations for this activity (optional)</Label>
        <p className="text-xs text-muted-foreground">
          For an activity that happens at more than one place — e.g. golf at two different courses — add each extra
          spot here instead of creating a second activity. The field above is this activity&apos;s usual/primary
          location.
        </p>
      </div>

      {additionalLocations.length > 0 && (
        <ul className="flex flex-col gap-2">
          {additionalLocations.map((location) => (
            <li key={location.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground" />
                {location.name}
                {location.address && <span className="text-xs text-muted-foreground">· {location.address}</span>}
              </span>
              <ConfirmDeleteButton
                action={() => removeActivityLocationAction(activityId, location.id)}
                size="sm"
                dialogTitle="Remove this location?"
                dialogDescription="This can't be undone."
              />
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="newLocationName" className="text-xs">
              Name
            </Label>
            <Input id="newLocationName" name="name" placeholder="e.g. Riverfront Golf Course" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="newLocationAddress" className="text-xs">
              Address (optional)
            </Label>
            <Input id="newLocationAddress" name="address" placeholder="e.g. 123 Main St, Eugene, OR" />
          </div>
        </div>
        {invalid && <p className="text-xs text-destructive">A name is required to add a location.</p>}
        {state.error && <p className="text-xs text-destructive">{state.error}</p>}
        <Button type="button" size="sm" variant="secondary" onClick={handleAdd} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Add another location"}
        </Button>
      </form>
    </div>
  );
}
