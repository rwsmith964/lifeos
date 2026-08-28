"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createChildcareRequestAction,
  type ChildcareRequestFormState,
} from "../../childcare-actions";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ChildcareRequestFormState = { error: null, sent: false };

export function ChildcareRequestForm({
  providers,
  childPeople,
}: {
  providers: PersonRow[];
  childPeople: PersonRow[];
}) {
  const [state, dispatch, pending] = useActionState(createChildcareRequestAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSubmit() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    dispatch(new FormData(formRef.current));
  }

  useEffect(() => {
    // No row id is returned to this client component (dispatch()'s return
    // is void, not the created row) — routing back to the People list
    // (where the new pending request now shows up) is simpler than
    // plumbing one through just for a redirect target.
    if (state.sent) router.push("/people");
  }, [state.sent, router]);

  return (
    <form ref={formRef} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="providerPersonId">Who are you asking?</Label>
        <select
          id="providerPersonId"
          name="providerPersonId"
          required
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          defaultValue=""
        >
          <option value="" disabled>
            Choose a provider
          </option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname || p.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Which kids?</Label>
        {childPeople.length === 0 ? (
          <p className="text-xs text-muted-foreground">No children added to People yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {childPeople.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="childPersonIds" value={c.id} />
                {c.nickname || c.full_name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="careDate">Date</Label>
        <Input id="careDate" name="careDate" type="date" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="careStartTime">Start time</Label>
          <Input id="careStartTime" name="careStartTime" type="time" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="careEndTime">End time</Label>
          <Input id="careEndTime" name="careEndTime" type="time" required />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="eventTitle">What&apos;s it for? (optional)</Label>
        <Input id="eventTitle" name="eventTitle" placeholder="e.g. Date night" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="customNote">Note to them (optional)</Label>
        <Textarea id="customNote" name="customNote" rows={3} placeholder="Any details they should know" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="button" onClick={handleSubmit} disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
