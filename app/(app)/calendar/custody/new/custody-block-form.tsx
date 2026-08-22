"use client";

import { useActionState } from "react";
import { createCustodyBlockAction } from "../../actions";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState = { error: null };
const BLOCK_TYPES = ["regular", "holiday", "swap", "vacation"] as const;

export function CustodyBlockForm({
  childPeople,
  responsibleCandidates,
}: {
  childPeople: PersonRow[];
  responsibleCandidates: PersonRow[];
}) {
  const [state, action, pending] = useActionState(createCustodyBlockAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
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
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save custody block"}
      </Button>
    </form>
  );
}
