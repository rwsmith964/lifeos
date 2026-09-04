"use client";

import { useActionState, useRef } from "react";
import { updatePersonAction, archivePersonAction, type SimpleFormState } from "../actions";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

const initialState: SimpleFormState = { error: null };

const RELATIONSHIP_OPTIONS = [
  "child",
  "spouse",
  "partner",
  "co_parent",
  "parent",
  "sibling",
  "extended_family",
  "friend",
  "colleague",
  "other",
] as const;

// D-162: closed set, optional/skippable -- "" (the default) is stored as
// null ("not specified"), distinct from the explicit "prefer_not_to_say"
// answer. Especially important to keep skippable for children (QUEUE-040).
const GENDER_OPTIONS = [
  ["", "Prefer not to answer / not specified"],
  ["female", "Female"],
  ["male", "Male"],
  ["non_binary", "Non-binary"],
  ["prefer_not_to_say", "Prefer not to say"],
] as const;

export function EditPersonForm({ person }: { person: PersonRow }) {
  const updateAction = updatePersonAction.bind(null, person.id);
  const [state, dispatch, pending] = useActionState(updateAction, initialState);
  const isSelf = person.relationship_type === "self";
  const isChild = person.relationship_type === "child";
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);

  // See DECISIONS.md D-031 — dispatch() called manually on click rather
  // than bound to the form's `action` prop.
  function handleSave() {
    if (!checkValid()) return;
    dispatch(new FormData(formRef.current!));
  }

  return (
    <div className="flex flex-col gap-6">
      <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" defaultValue={person.full_name} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="nickname">Nickname</Label>
          <Input id="nickname" name="nickname" defaultValue={person.nickname ?? ""} />
        </div>
        {!isSelf && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="relationshipType">Relationship</Label>
            <select
              id="relationshipType"
              name="relationshipType"
              defaultValue={person.relationship_type}
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            >
              {RELATIONSHIP_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="gender">Gender (optional)</Label>
          <select
            id="gender"
            name="gender"
            defaultValue={person.gender ?? ""}
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          >
            {GENDER_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="birthdate">Birthdate</Label>
          <Input id="birthdate" name="birthdate" type="date" defaultValue={person.birthdate ?? ""} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="birthYearKnown" defaultChecked={person.birth_year_known} /> I know their
            birth year
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={person.phone ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={person.email ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={person.notes} />
        </div>
        {!isSelf && (
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="isChildcareProvider"
                defaultChecked={person.is_childcare_provider}
              />
              This person can provide childcare
            </label>
            <p className="text-xs text-muted-foreground">
              Tag someone like a grandparent or babysitter so you can request childcare from them — they
              don&apos;t need a LifeOS account to accept or decline.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="address">Their address</Label>
              <Input
                id="address"
                name="address"
                defaultValue={person.address ?? ""}
                placeholder="Used to estimate drive/drop-off time for childcare requests"
              />
            </div>
          </div>
        )}
        {!isChild && (
          <div className="flex flex-col gap-1 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="showWorkScheduleOnCalendar"
                defaultChecked={person.show_work_schedule_on_calendar}
              />
              Show {isSelf ? "my" : `${person.nickname || person.full_name}'s`} work schedule on the calendar
            </label>
            <p className="text-xs text-muted-foreground">
              When on, this person&apos;s weekly shifts and time off (below) appear on the shared /calendar view.
              Off by default for anyone besides yourself — turn it on for a spouse or partner if you want their
              shifts visible too.
            </p>
          </div>
        )}
        {invalid && <p className="text-sm text-destructive">Please fill in the required fields above.</p>}
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      {!isSelf && (
        <ConfirmDeleteButton
          label={`Archive ${person.full_name}`}
          confirmLabel={`Confirm archive ${person.full_name}`}
          action={() => archivePersonAction(person.id)}
        />
      )}
    </div>
  );
}
