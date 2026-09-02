"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { addDietaryPreferenceAction, removeDietaryPreferenceAction } from "./actions";
import { DIETARY_RESTRICTIONS, DIETARY_RESTRICTION_LABELS } from "@/lib/household/labels";
import type { DietaryPreferenceRow, DietaryRestriction, PersonRow } from "@/lib/db/database.types";

export function DietaryPreferencesCard({
  people,
  preferences,
}: {
  people: PersonRow[];
  preferences: DietaryPreferenceRow[];
}) {
  const { showToast } = useToast();
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [restriction, setRestriction] = useState<DietaryRestriction>("vegetarian");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!personId) return;
    setPending(true);
    try {
      await addDietaryPreferenceAction(personId, restriction, notes);
      setNotes("");
      showToast({ title: "Dietary preference added.", variant: "success" });
    } catch (err) {
      showToast({
        title: "Couldn't add that preference",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {preferences.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dietary preferences recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {preferences.map((pref) => {
            const person = people.find((p) => p.id === pref.person_id);
            return (
              <div key={pref.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="text-sm">
                  <span className="font-medium">{person?.full_name ?? "Someone"}</span>{" "}
                  <span className="text-muted-foreground">— {DIETARY_RESTRICTION_LABELS[pref.restriction]}</span>
                  {pref.notes && <span className="text-muted-foreground"> ({pref.notes})</span>}
                </div>
                <ConfirmDeleteButton
                  action={async () => {
                    await removeDietaryPreferenceAction(pref.id);
                  }}
                  label="Remove"
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="dp-person">Person</Label>
          <select
            id="dp-person"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dp-restriction">Restriction</Label>
          <select
            id="dp-restriction"
            value={restriction}
            onChange={(e) => setRestriction(e.target.value as DietaryRestriction)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {DIETARY_RESTRICTIONS.map((r) => (
              <option key={r} value={r}>
                {DIETARY_RESTRICTION_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dp-notes">Notes (optional)</Label>
          <Input id="dp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. no cilantro" />
        </div>
        <Button type="submit" disabled={pending || !personId} size="sm">
          Add
        </Button>
      </form>
    </div>
  );
}
