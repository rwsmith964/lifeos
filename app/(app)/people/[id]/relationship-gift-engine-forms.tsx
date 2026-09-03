"use client";

// Module 1: Relationship & Gift Engine (D-117/D-158, relationship_gift_engine_v2
// flag) -- client forms for the person-detail page's six new sections. Mirrors
// the established conventions in ./person-forms.tsx exactly: manual
// dispatch() of useActionState's action on button click (D-031, native
// <form action={fn}> unreliable under this app's auth layout), checkValidity()
// + useFormValidity for inline required-field messages (D-079/P2-5), and
// ConfirmDeleteButton / useAsyncToastAction for delete and toggle feedback.
import { useActionState, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { occasionTypeDisplayLabel, reciprocityDirectionDisplayLabel } from "@/lib/gifts/occasions";
import type {
  ConversationLogEntryRow,
  GiftReciprocityEntryRow,
  MomentRow,
  OccasionType,
  PersonProfileDetailsRow,
  PersonRelationshipRow,
  PersonRow,
  PersonWishlistItemRow,
  ReciprocityDirection,
} from "@/lib/db/database.types";
import {
  addConversationLogEntryAction,
  addMomentAction,
  addPersonRelationshipAction,
  addReciprocityEntryAction,
  addWishlistItemAction,
  fulfillReciprocityEntryAction,
  removeConversationLogEntryAction,
  removeMomentAction,
  removePersonRelationshipAction,
  removeReciprocityEntryAction,
  removeWishlistItemAction,
  saveProfileDetailsAction,
  unfulfillReciprocityEntryAction,
  type SimpleFormState,
} from "./relationship-gift-engine-actions";

const initialState: SimpleFormState = { error: null };

// Reuses the exact option lists already live in event-form.tsx / people/new/page.tsx
// so a relation label typed here reads the same as everywhere else in the app --
// but relation_label is a free-text column (not an enum), so these are just
// starting suggestions via a datalist, never a hard constraint.
const RELATION_LABEL_SUGGESTIONS = [
  "spouse",
  "partner",
  "child",
  "co-parent",
  "parent",
  "sibling",
  "extended family",
  "friend",
  "colleague",
] as const;

const OCCASION_OPTIONS_WITH_BLANK = ["", "birthday", "christmas", "anniversary", "graduation", "just_because", "default"] as const;
const DIRECTION_OPTIONS: ReciprocityDirection[] = ["given_to_them", "received_from_them"];

// person_profile_details ------------------------------------------------------

export function ProfileDetailsForm({
  personId,
  details,
}: {
  personId: string;
  details: PersonProfileDetailsRow | null;
}) {
  const action = saveProfileDetailsAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { clearInvalid } = useFormValidity(formRef);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(false);
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (!pending && !state.error && formRef.current) setSaved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`clothing-size-${personId}`} className="text-xs">
            Clothing size
          </Label>
          <Input
            id={`clothing-size-${personId}`}
            name="clothingSize"
            defaultValue={details?.clothing_size ?? ""}
            placeholder="Medium"
            className="h-8"
            onChange={() => setSaved(false)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`shoe-size-${personId}`} className="text-xs">
            Shoe size
          </Label>
          <Input
            id={`shoe-size-${personId}`}
            name="shoeSize"
            defaultValue={details?.shoe_size ?? ""}
            placeholder="9.5"
            className="h-8"
            onChange={() => setSaved(false)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`ring-size-${personId}`} className="text-xs">
            Ring size
          </Label>
          <Input
            id={`ring-size-${personId}`}
            name="ringSize"
            defaultValue={details?.ring_size ?? ""}
            placeholder="7"
            className="h-8"
            onChange={() => setSaved(false)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`how-we-met-${personId}`} className="text-xs">
            How we met
          </Label>
          <Input
            id={`how-we-met-${personId}`}
            name="howWeMet"
            defaultValue={details?.how_we_met ?? ""}
            placeholder="College roommates"
            className="h-8"
            onChange={() => setSaved(false)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`food-preferences-${personId}`} className="text-xs">
          Food preferences
        </Label>
        <Textarea
          id={`food-preferences-${personId}`}
          name="foodPreferences"
          defaultValue={details?.food_preferences ?? ""}
          placeholder="Vegetarian, allergic to shellfish, loves spicy food"
          rows={2}
          onChange={() => setSaved(false)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`preferred-brands-${personId}`} className="text-xs">
          Preferred brands
        </Label>
        <Textarea
          id={`preferred-brands-${personId}`}
          name="preferredBrands"
          defaultValue={details?.preferred_brands ?? ""}
          placeholder="Patagonia, Nike, Le Creuset"
          rows={2}
          onChange={() => setSaved(false)}
        />
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          Save details
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved.</span>}
      </div>
    </form>
  );
}

// person_wishlist_items -------------------------------------------------------

export function AddWishlistItemForm({ personId }: { personId: string }) {
  const action = addWishlistItemAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
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
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor={`wishlist-item-${personId}`} className="text-xs">
          Wishlist item
        </Label>
        <Input
          id={`wishlist-item-${personId}`}
          name="item"
          placeholder="A nice French press"
          required
          className="h-8"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
        {showError && <p className="text-xs text-destructive">{state.error}</p>}
        {invalid && !showError && <p className="text-xs text-destructive">Describe what they want.</p>}
      </div>
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Add
      </Button>
    </form>
  );
}

export function WishlistItemRow({ personId, item }: { personId: string; item: PersonWishlistItemRow }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <p>
        {item.item}
        {item.source === "conversation_log" && (
          <span className="text-muted-foreground"> — from a conversation note</span>
        )}
      </p>
      <ConfirmDeleteButton
        variant="icon"
        ariaLabel="Remove wishlist item"
        action={() => removeWishlistItemAction(personId, item.id)}
      />
    </div>
  );
}

// person_relationships ---------------------------------------------------------

export function AddRelationshipForm({
  personId,
  householdPeople,
}: {
  personId: string;
  householdPeople: PersonRow[];
}) {
  const action = addPersonRelationshipAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const datalistId = `relation-label-options-${personId}`;

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
  const otherPeople = householdPeople.filter((p) => p.id !== personId);

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {otherPeople.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`related-person-${personId}`} className="text-xs">
              Already in LifeOS?
            </Label>
            <select
              id={`related-person-${personId}`}
              name="relatedPersonId"
              defaultValue=""
              className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
              onChange={(e) => {
                const selected = otherPeople.find((p) => p.id === e.target.value);
                if (selected && nameInputRef.current) nameInputRef.current.value = selected.full_name;
              }}
            >
              <option value="">Not in the app</option>
              {otherPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor={`related-name-${personId}`} className="text-xs">
            Name
          </Label>
          <Input
            id={`related-name-${personId}`}
            name="relatedName"
            ref={nameInputRef}
            placeholder="Jane Smith"
            required
            className="h-8 w-36"
            aria-invalid={!!showError || undefined}
            onChange={() => setErrorDismissed(true)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`relation-label-${personId}`} className="text-xs">
            Relation
          </Label>
          <Input
            id={`relation-label-${personId}`}
            name="relationLabel"
            list={datalistId}
            placeholder="wife, son, best friend"
            required
            className="h-8 w-36"
            onChange={() => setErrorDismissed(true)}
          />
          <datalist id={datalistId}>
            {RELATION_LABEL_SUGGESTIONS.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
          Add
        </Button>
      </div>
      <Textarea name="notes" placeholder="Notes (optional)" rows={1} className="text-sm" />
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && (
        <p className="text-xs text-destructive">Name and relation are both required.</p>
      )}
    </form>
  );
}

export function RelationshipRow({
  personId,
  relationship,
}: {
  personId: string;
  relationship: PersonRelationshipRow;
}) {
  return (
    <div className="flex items-start justify-between text-sm">
      <p>
        <span className="font-medium">{relationship.related_name}</span>{" "}
        <span className="text-muted-foreground">— {relationship.relation_label}</span>
        {relationship.notes && <span className="block text-xs text-muted-foreground">{relationship.notes}</span>}
      </p>
      <ConfirmDeleteButton
        variant="icon"
        ariaLabel="Remove relationship"
        action={() => removePersonRelationshipAction(personId, relationship.id)}
      />
    </div>
  );
}

// conversation_log_entries -----------------------------------------------------

export function AddConversationLogEntryForm({ personId }: { personId: string }) {
  const action = addConversationLogEntryAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const todayStr = format(new Date(), "yyyy-MM-dd");

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
          <Label htmlFor={`entry-date-${personId}`} className="text-xs">
            Date
          </Label>
          <Input
            id={`entry-date-${personId}`}
            name="entryDate"
            type="date"
            defaultValue={todayStr}
            className="h-8"
          />
        </div>
      </div>
      <Textarea
        name="content"
        placeholder='What did they mention? e.g. "Said they want to try pottery classes."'
        required
        rows={2}
        aria-invalid={!!showError || undefined}
        onChange={() => setErrorDismissed(true)}
      />
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="text-xs text-destructive">Enter what was said.</p>}
      <div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
          Add note
        </Button>
      </div>
    </form>
  );
}

export function ConversationLogRow({ personId, entry }: { personId: string; entry: ConversationLogEntryRow }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <p>
        <span className="font-medium">{format(new Date(`${entry.entry_date}T00:00:00`), "MMM d, yyyy")}</span>{" "}
        <span className="text-muted-foreground">{entry.content}</span>
      </p>
      <ConfirmDeleteButton
        variant="icon"
        ariaLabel="Remove conversation note"
        action={() => removeConversationLogEntryAction(personId, entry.id)}
      />
    </div>
  );
}

// moments -----------------------------------------------------------------------

export function AddMomentForm({
  personId,
  householdPeople,
}: {
  personId: string;
  householdPeople: PersonRow[];
}) {
  const [state, dispatch, pending] = useActionState(addMomentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const todayStr = format(new Date(), "yyyy-MM-dd");

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
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={`moment-title-${personId}`} className="text-xs">
            Title
          </Label>
          <Input
            id={`moment-title-${personId}`}
            name="title"
            placeholder="Beach day at Cannon Beach"
            required
            className="h-8"
            aria-invalid={!!showError || undefined}
            onChange={() => setErrorDismissed(true)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`moment-date-${personId}`} className="text-xs">
            Date
          </Label>
          <Input id={`moment-date-${personId}`} name="occurredOn" type="date" defaultValue={todayStr} required className="h-8" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`moment-place-${personId}`} className="text-xs">
            Place (optional)
          </Label>
          <Input id={`moment-place-${personId}`} name="place" placeholder="Cannon Beach, OR" className="h-8" />
        </div>
      </div>
      <Textarea name="notes" placeholder="Notes (optional)" rows={2} />
      {householdPeople.length > 1 && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Who was there?</Label>
          <div className="flex flex-wrap gap-3">
            {householdPeople.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="participantPersonIds" value={p.id} defaultChecked={p.id === personId} />
                {p.full_name}
              </label>
            ))}
          </div>
        </div>
      )}
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="text-xs text-destructive">Give this moment a title and date.</p>}
      <div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
          Add moment
        </Button>
      </div>
    </form>
  );
}

export function MomentRow({ moment, participantNames }: { moment: MomentRow; participantNames: string[] }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div>
        <p>
          <span className="font-medium">{moment.title}</span>{" "}
          <span className="text-xs text-muted-foreground">{format(new Date(`${moment.occurred_on}T00:00:00`), "MMM d, yyyy")}</span>
          {moment.place && <span className="text-xs text-muted-foreground"> · {moment.place}</span>}
        </p>
        {participantNames.length > 0 && (
          <p className="text-xs text-muted-foreground">With {participantNames.join(", ")}</p>
        )}
        {moment.notes && <p className="text-xs text-muted-foreground">{moment.notes}</p>}
      </div>
      <ConfirmDeleteButton variant="icon" ariaLabel="Remove moment" action={() => removeMomentAction(moment.id)} />
    </div>
  );
}

// gift_reciprocity_entries -------------------------------------------------------

export function AddReciprocityEntryForm({ personId }: { personId: string }) {
  const action = addReciprocityEntryAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [isPromise, setIsPromise] = useState(false);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) {
      formRef.current?.reset();
      setIsPromise(false);
    }
    justSubmittedRef.current = false;
  }, [state]);

  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`reciprocity-direction-${personId}`} className="text-xs">
            Direction
          </Label>
          <select
            id={`reciprocity-direction-${personId}`}
            name="direction"
            defaultValue="given_to_them"
            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            {DIRECTION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {reciprocityDirectionDisplayLabel(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={`reciprocity-description-${personId}`} className="text-xs">
            Description
          </Label>
          <Input
            id={`reciprocity-description-${personId}`}
            name="description"
            placeholder="Watched their dog for a weekend"
            required
            className="h-8"
            aria-invalid={!!showError || undefined}
            onChange={() => setErrorDismissed(true)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`reciprocity-occasion-${personId}`} className="text-xs">
            Occasion (optional)
          </Label>
          <select
            id={`reciprocity-occasion-${personId}`}
            name="occasionType"
            defaultValue=""
            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            {OCCASION_OPTIONS_WITH_BLANK.map((o) => (
              <option key={o} value={o}>
                {o === "" ? "None" : occasionTypeDisplayLabel(o as OccasionType)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`reciprocity-date-${personId}`} className="text-xs">
            Date (optional)
          </Label>
          <Input id={`reciprocity-date-${personId}`} name="occurredOn" type="date" className="h-8" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            name="isPromise"
            checked={isPromise}
            onChange={(e) => setIsPromise(e.target.checked)}
          />
          This is an outstanding promise
        </label>
        {isPromise && (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`reciprocity-due-${personId}`} className="text-xs">
              Due by
            </Label>
            <Input id={`reciprocity-due-${personId}`} name="promiseDueDate" type="date" className="h-8" />
          </div>
        )}
      </div>
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="text-xs text-destructive">Describe the gift.</p>}
      <div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
          Add entry
        </Button>
      </div>
    </form>
  );
}

export function ReciprocityEntryRow({ personId, entry }: { personId: string; entry: GiftReciprocityEntryRow }) {
  const { pending: fulfillPending, run: runFulfill } = useAsyncToastAction(
    () => fulfillReciprocityEntryAction(personId, entry.id).then((r) => { if (r.error) throw new Error(r.error); }),
    {
      successMessage: "Marked fulfilled.",
      errorMessage: "Couldn't update that",
      onUndo: () =>
        unfulfillReciprocityEntryAction(personId, entry.id).then((r) => {
          if (r.error) throw new Error(r.error);
        }),
      undoMessage: "Marked unfulfilled again.",
    }
  );

  const isOverdue = entry.is_promise && !entry.fulfilled_at && entry.promise_due_date && entry.promise_due_date < format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div>
        <p>
          <span className="font-medium">{reciprocityDirectionDisplayLabel(entry.direction)}:</span>{" "}
          {entry.description}
        </p>
        <p className="text-xs text-muted-foreground">
          {entry.occasion_type && `${occasionTypeDisplayLabel(entry.occasion_type)} · `}
          {entry.occurred_on && `${format(new Date(`${entry.occurred_on}T00:00:00`), "MMM d, yyyy")} · `}
          {entry.is_promise &&
            (entry.fulfilled_at
              ? `Fulfilled ${format(new Date(`${entry.fulfilled_at}T00:00:00`), "MMM d, yyyy")}`
              : entry.promise_due_date
                ? `${isOverdue ? "Overdue — was due" : "Due"} ${format(new Date(`${entry.promise_due_date}T00:00:00`), "MMM d, yyyy")}`
                : "Outstanding promise")}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {entry.is_promise && !entry.fulfilled_at && (
          <Button type="button" size="sm" variant="outline" disabled={fulfillPending} onClick={runFulfill}>
            Mark fulfilled
          </Button>
        )}
        <ConfirmDeleteButton
          variant="icon"
          ariaLabel="Remove entry"
          action={() => removeReciprocityEntryAction(personId, entry.id)}
        />
      </div>
    </div>
  );
}
