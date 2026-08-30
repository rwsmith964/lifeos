"use client";

import { useRef } from "react";
import { useFormPost } from "@/lib/hooks/use-form-post";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  const { submit, pending, error } = useFormPost("/api/people");
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);

  function handleSave() {
    if (!checkValid()) return;
    submit(new FormData(formRef.current!), { redirectTo: (data) => `/people/${data.id}` });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add someone</h1>
      <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-4">
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
        {invalid && <p className="text-sm text-destructive">Please fill in the required fields above.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}
