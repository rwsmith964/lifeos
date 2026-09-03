"use client";

// Module 2: Leisure Planner (D-118/D-160, leisure_planner_v2 flag) -- client
// forms for the viability config manager, gear checklist manager, and outing
// log form. Mirrors the conventions established in
// ../people/[id]/relationship-gift-engine-forms.tsx: manual dispatch() of
// useActionState's action on button click (D-031), checkValidity() +
// useFormValidity for inline required-field messages (D-079/P2-5), and
// ConfirmDeleteButton for delete feedback. Unlike Module 1's actions, every
// add/save action here reads household_id from the server-side session
// itself (requireHouseholdContext()), so no id needs to be bound into the
// action -- only the delete actions take an id argument.
import { useActionState, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import type { ActivityTypeViabilityConfigRow, GearChecklistItemRow, LeisureOutingLogRow, PersonRow } from "@/lib/db/database.types";
import type { ResolvedGearChecklistItem } from "@/lib/planner/gear-checklist";
import {
  addGearChecklistItemAction,
  deleteOutingLogAction,
  deleteViabilityConfigAction,
  logOutingAction,
  removeGearChecklistItemAction,
  saveViabilityConfigAction,
  type SimpleFormState,
} from "./leisure-planner-actions";

const initialState: SimpleFormState = { error: null };

/** activity_type_key is stored lower/trimmed (see lib/db/schemas.ts's
 * activityTypeKey()) -- capitalize just the first letter for a readable
 * label. Not a raw enum value; this is free text the household typed in. */
function displayActivityType(key: string): string {
  return key.length > 0 ? key[0].toUpperCase() + key.slice(1) : key;
}

const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

// activity_type_viability_configs ----------------------------------------------

export function AddViabilityConfigForm({ activityTypeSuggestions }: { activityTypeSuggestions: string[] }) {
  const [state, dispatch, pending] = useActionState(saveViabilityConfigAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) formRef.current?.reset();
    justSubmittedRef.current = false;
  }, [state]);

  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="viability-activity-type" className="text-xs">
            Activity type
          </Label>
          <Input
            id="viability-activity-type"
            name="activityType"
            list="viability-activity-type-options"
            placeholder="fishing"
            required
            className="h-8 w-32"
            aria-invalid={!!showError || undefined}
            onChange={() => setErrorDismissed(true)}
          />
          <datalist id="viability-activity-type-options">
            {activityTypeSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="viability-relevant-inputs" className="text-xs">
            Relevant inputs (comma-separated)
          </Label>
          <Input
            id="viability-relevant-inputs"
            name="relevantInputs"
            placeholder="wind speed, tide, water temperature"
            className="h-8"
          />
        </div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
          Save
        </Button>
      </div>
      <Textarea name="notes" placeholder="Notes (optional)" rows={1} className="text-sm" />
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="text-xs text-destructive">Enter the activity type this applies to.</p>}
    </form>
  );
}

export function ViabilityConfigRow({ config }: { config: ActivityTypeViabilityConfigRow }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div>
        <p className="font-medium">{displayActivityType(config.activity_type_key)}</p>
        {config.relevant_inputs.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {config.relevant_inputs.map((input) => (
              <Badge key={input} variant="outline">
                {input}
              </Badge>
            ))}
          </div>
        )}
        {config.notes && <p className="mt-1 text-xs text-muted-foreground">{config.notes}</p>}
      </div>
      <ConfirmDeleteButton
        variant="icon"
        ariaLabel="Remove viability config"
        action={() => deleteViabilityConfigAction(config.id)}
      />
    </div>
  );
}

// gear_checklist_items — type-level defaults (household + activity_type_key) -----

export function AddTypeGearChecklistItemForm({ activityTypeSuggestions }: { activityTypeSuggestions: string[] }) {
  const [state, dispatch, pending] = useActionState(addGearChecklistItemAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) formRef.current?.reset();
    justSubmittedRef.current = false;
  }, [state]);

  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="type-gear-activity-type" className="text-xs">
          Activity type
        </Label>
        <Input
          id="type-gear-activity-type"
          name="activityTypeKey"
          list="type-gear-activity-type-options"
          placeholder="fishing"
          required
          className="h-8 w-32"
          onChange={() => setErrorDismissed(true)}
        />
        <datalist id="type-gear-activity-type-options">
          {activityTypeSuggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="type-gear-item-label" className="text-xs">
          Default gear item
        </Label>
        <Input
          id="type-gear-item-label"
          name="itemLabel"
          placeholder="Rain jacket"
          required
          className="h-8"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Add
      </Button>
      {showError && <p className="w-full text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && (
        <p className="w-full text-xs text-destructive">Enter both the activity type and the gear item.</p>
      )}
    </form>
  );
}

export function TypeGearChecklistItemRow({ item }: { item: GearChecklistItemRow }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{item.item_label}</span>
      <ConfirmDeleteButton
        variant="icon"
        ariaLabel="Remove default gear item"
        action={() => removeGearChecklistItemAction(item.id)}
      />
    </div>
  );
}

// gear_checklist_items — activity-specific (edit page) ---------------------------

export function AddActivityGearChecklistItemForm({ userActivityId }: { userActivityId: string }) {
  const [state, dispatch, pending] = useActionState(addGearChecklistItemAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) formRef.current?.reset();
    justSubmittedRef.current = false;
  }, [state]);

  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="userActivityId" value={userActivityId} />
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor={`activity-gear-item-${userActivityId}`} className="text-xs">
          Add gear item for this activity
        </Label>
        <Input
          id={`activity-gear-item-${userActivityId}`}
          name="itemLabel"
          placeholder="Extra reel"
          required
          className="h-8"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Add
      </Button>
      {showError && <p className="w-full text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="w-full text-xs text-destructive">Describe the gear item.</p>}
    </form>
  );
}

export function ResolvedGearChecklistList({ items }: { items: ResolvedGearChecklistItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No gear items yet.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5">
            {item.label}
            {item.origin === "type_default" && (
              <Badge variant="secondary" className="text-[10px]">
                default for this type
              </Badge>
            )}
          </span>
          {item.origin === "activity" ? (
            <ConfirmDeleteButton
              variant="icon"
              ariaLabel="Remove gear item"
              action={() => removeGearChecklistItemAction(item.id)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">Manage in Activities settings</span>
          )}
        </div>
      ))}
    </div>
  );
}

// leisure_outing_logs -----------------------------------------------------------

export function AddOutingLogForm({
  userActivityId,
  possibleCompanions,
  gearItems,
}: {
  userActivityId: string;
  possibleCompanions: PersonRow[];
  gearItems: ResolvedGearChecklistItem[];
}) {
  const [state, dispatch, pending] = useActionState(logOutingAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [companionIds, setCompanionIds] = useState<string[]>([]);
  const [gearIds, setGearIds] = useState<string[]>([]);
  const [logAsMoment, setLogAsMoment] = useState(false);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  function toggleId(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false);
    const fd = new FormData(formRef.current!);
    fd.set("companionsPersonIds", companionIds.join(","));
    fd.set("gearItemsPacked", gearIds.join(","));
    dispatch(fd);
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) {
      formRef.current?.reset();
      setCompanionIds([]);
      setGearIds([]);
      setLogAsMoment(false);
    }
    justSubmittedRef.current = false;
  }, [state]);

  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-2">
      <input type="hidden" name="userActivityId" value={userActivityId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`outing-date-${userActivityId}`} className="text-xs">
            Date
          </Label>
          <Input id={`outing-date-${userActivityId}`} name="occurredOn" type="date" defaultValue={todayStr} required className="h-8" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`outing-rating-${userActivityId}`} className="text-xs">
            Rating
          </Label>
          <select
            id={`outing-rating-${userActivityId}`}
            name="rating"
            defaultValue=""
            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">No rating</option>
            {RATING_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r} / 5
              </option>
            ))}
          </select>
        </div>
      </div>
      <Textarea name="conditionsNotes" placeholder="Conditions (optional) — e.g. sunny, light wind" rows={1} />
      <Textarea name="notes" placeholder="Notes (optional)" rows={2} />
      {possibleCompanions.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Who went?</Label>
          <div className="flex flex-wrap gap-3">
            {possibleCompanions.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={companionIds.includes(p.id)}
                  onChange={() => toggleId(companionIds, setCompanionIds, p.id)}
                />
                {p.full_name}
              </label>
            ))}
          </div>
        </div>
      )}
      {gearItems.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Gear packed</Label>
          <div className="flex flex-wrap gap-3">
            {gearItems.map((item) => (
              <label key={item.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={gearIds.includes(item.id)}
                  onChange={() => toggleId(gearIds, setGearIds, item.id)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          name="logAsMoment"
          checked={logAsMoment}
          onChange={(e) => setLogAsMoment(e.target.checked)}
        />
        Also log this as a family moment
      </label>
      {logAsMoment && (
        <Input name="momentTitle" placeholder="Moment title (e.g. Fishing trip on the Willamette)" className="h-8" />
      )}
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="text-xs text-destructive">Enter the date this outing happened.</p>}
      <div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
          Log outing
        </Button>
      </div>
    </form>
  );
}

export function OutingLogRow({
  log,
  householdPeopleById,
  gearItemLabelById,
}: {
  log: LeisureOutingLogRow;
  householdPeopleById: Map<string, string>;
  gearItemLabelById: Map<string, string>;
}) {
  const companionNames = log.companions_person_ids.map((id) => householdPeopleById.get(id) ?? "Someone").filter(Boolean);
  const gearLabels = log.gear_items_packed.map((id) => gearItemLabelById.get(id)).filter((v): v is string => Boolean(v));

  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div>
        <p>
          <span className="font-medium">{format(parseISO(log.occurred_on), "MMM d, yyyy")}</span>
          {log.rating != null && <span className="text-xs text-muted-foreground"> · Rating {log.rating}/5</span>}
        </p>
        {log.conditions_notes && <p className="text-xs text-muted-foreground">{log.conditions_notes}</p>}
        {companionNames.length > 0 && <p className="text-xs text-muted-foreground">With {companionNames.join(", ")}</p>}
        {gearLabels.length > 0 && <p className="text-xs text-muted-foreground">Packed: {gearLabels.join(", ")}</p>}
        {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
      </div>
      <ConfirmDeleteButton variant="icon" ariaLabel="Remove outing log" action={() => deleteOutingLogAction(log.id)} />
    </div>
  );
}
