"use client";

import { useRef } from "react";
import { useFormPost } from "@/lib/hooks/use-form-post";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import { Breadcrumb } from "@/components/nav/breadcrumb";
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

// D-162: closed set, optional/skippable -- "" (the default) is stored as
// null ("not specified"), distinct from the explicit "prefer_not_to_say"
// answer. Especially important to keep skippable for children (QUEUE-040).
// P-01 (audit pass 2026-09-11): "Not specified" and "Prefer not to say"
// used to carry near-identical labels ("Prefer not to answer / not
// specified" vs. "Prefer not to say"), reading as an accidental duplicate
// even though the two values are meaningfully different underneath (a
// silent skip vs. an explicit answer) -- relabeled so that distinction is
// actually visible instead of removing either value.
const GENDER_OPTIONS = [
  ["", "Not specified"],
  ["female", "Female"],
  ["male", "Male"],
  ["non_binary", "Non-binary"],
  ["prefer_not_to_say", "Prefer not to say"],
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
      <Breadcrumb items={[{ label: "People", href: "/people" }, { label: "Add someone" }]} />
      <h1 className="text-xl font-semibold">Add someone</h1>
      <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">
            Full name <span aria-hidden="true">*</span>
          </Label>
          <Input id="fullName" name="fullName" required aria-describedby={invalid ? "fullName-error" : undefined} />
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
          <Label htmlFor="gender">Gender (optional)</Label>
          <select
            id="gender"
            name="gender"
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            defaultValue=""
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
          <Input id="birthdate" name="birthdate" type="date" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="birthYearKnown" defaultChecked /> I know their birth year
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>
        {/* P-02: named the one actual required field instead of a generic
            "fields above" (there's only ever one), and gave it a stable id
            so the input above can point aria-describedby at it. */}
        {invalid && (
          <p id="fullName-error" className="text-sm text-destructive">
            Full name is required.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}
