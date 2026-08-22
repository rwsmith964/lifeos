"use client";

import { useActionState } from "react";
import { createPersonAction, type PersonFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: PersonFormState = { error: null };

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

export default function NewPersonPage() {
  const [state, action, pending] = useActionState(createPersonAction, initialState);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add someone</h1>
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="nickname">Nickname (optional)</Label>
          <Input id="nickname" name="nickname" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="relationshipType">Relationship</Label>
          <select
            id="relationshipType"
            name="relationshipType"
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            defaultValue="friend"
          >
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="birthdate">Birthdate</Label>
          <Input id="birthdate" name="birthdate" type="date" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="birthYearKnown" defaultChecked /> I know their birth year
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}
