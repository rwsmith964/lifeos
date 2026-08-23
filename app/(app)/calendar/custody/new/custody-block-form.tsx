"use client";

import { useRef } from "react";
import { useFormPost } from "@/lib/hooks/use-form-post";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BLOCK_TYPES = ["regular", "holiday", "swap", "vacation"] as const;

export function CustodyBlockForm({
  childPeople,
  responsibleCandidates,
}: {
  childPeople: PersonRow[];
  responsibleCandidates: PersonRow[];
}) {
  const { submit, pending, error } = useFormPost("/api/calendar/custody");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSave() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    submit(new FormData(formRef.current), { redirectTo: () => "/calendar" });
  }

  return (
    <form ref={formRef} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="childPersonId">Child</Label>
        <select
          id="childPersonId"
          name="childPersonId"
          required
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          {childPeople.map((child) => (
            <option key={child.id} value={child.id}>
              {child.full_name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="responsiblePersonId">Responsible parent</Label>
        <select
          id="responsiblePersonId"
          name="responsiblePersonId"
          required
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          {responsibleCandidates.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" name="startDate" type="date" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" name="endDate" type="date" required />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="blockType">Type</Label>
        <select
          id="blockType"
          name="blockType"
          defaultValue="regular"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          {BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSave} disabled={pending}>
        {pending ? "Saving…" : "Save custody block"}
      </Button>
    </form>
  );
}
