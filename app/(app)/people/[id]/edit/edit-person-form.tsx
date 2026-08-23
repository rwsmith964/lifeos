"use client";

import { useActionState, useRef, useTransition } from "react";
import { updatePersonAction, archivePersonAction, type SimpleFormState } from "../actions";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

export function EditPersonForm({ person }: { person: PersonRow }) {
  const updateAction = updatePersonAction.bind(null, person.id);
  const [state, dispatch, pending] = useActionState(updateAction, initialState);
  const [archivePending, startArchiveTransition] = useTransition();
  const isSelf = person.relationship_type === "self";
  const formRef = useRef<HTMLFormElement>(null);

  // See DECISIONS.md D-031 — dispatch() called manually on click rather
  // than bound to the form's `action` prop.
  function handleSave() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    dispatch(new FormData(formRef.current));
  }

  return (
    <div className="flex flex-col gap-6">
      <form ref={formRef} className="flex flex-col gap-4">
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
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      {!isSelf && (
        <Button
          type="button"
          variant="outline"
          disabled={archivePending}
          onClick={() => startArchiveTransition(() => archivePersonAction(person.id))}
        >
          Archive {person.full_name}
        </Button>
      )}
    </div>
  );
}
