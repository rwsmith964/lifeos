"use client";

import { useRef } from "react";
import { useFormPost } from "@/lib/hooks/use-form-post";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BLOCK_TYPES = ["regular", "holiday", "swap", "vacation"] as const;

// D-097: same form now backs both /calendar/custody/one-off (create) and
// /calendar/custody/one-off/[id]/edit (edit) — same fields/validation,
// only endpoint/method/defaults/redirect/labels differ, mirroring how
// EventForm was generalized for create+edit in D-056.
export interface CustodyBlockFormDefaults {
  childPersonId: string;
  responsiblePersonId: string;
  startDate: string;
  endDate: string;
  handoverTime: string;
  blockType: string;
  location: string;
}

export function CustodyBlockForm({
  childPeople,
  responsibleCandidates,
  endpoint = "/api/calendar/custody",
  method = "POST",
  defaults,
  redirectTo = () => "/calendar/custody",
  submitLabel = "Save custody block",
  pendingLabel = "Saving…",
}: {
  childPeople: PersonRow[];
  responsibleCandidates: PersonRow[];
  endpoint?: string;
  method?: "POST" | "PATCH";
  defaults?: CustodyBlockFormDefaults;
  redirectTo?: () => string;
  submitLabel?: string;
  pendingLabel?: string;
}) {
  const { submit, pending, error } = useFormPost(endpoint);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);

  function handleSave() {
    if (!checkValid()) return;
    submit(new FormData(formRef.current!), { method, redirectTo });
  }

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="childPersonId">Child</Label>
        <select
          id="childPersonId"
          name="childPersonId"
          required
          defaultValue={defaults?.childPersonId}
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
          defaultValue={defaults?.responsiblePersonId}
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
          <Input id="startDate" name="startDate" type="date" required defaultValue={defaults?.startDate} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" name="endDate" type="date" required defaultValue={defaults?.endDate} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="handoverTime">Handover time</Label>
          <Input
            id="handoverTime"
            name="handoverTime"
            type="time"
            defaultValue={defaults?.handoverTime ?? "17:00"}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="blockType">Type</Label>
          <select
            id="blockType"
            name="blockType"
            defaultValue={defaults?.blockType ?? "regular"}
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {BLOCK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Handover location (optional)</Label>
        <Input id="location" name="location" placeholder="e.g. School pickup" defaultValue={defaults?.location} />
      </div>
      {invalid && <p className="text-sm text-destructive">Please fill in the required fields above.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSave} disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
