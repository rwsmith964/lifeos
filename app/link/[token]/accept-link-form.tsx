"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptLinkInviteAction } from "./actions";

interface HouseholdOption {
  id: string;
  name: string;
  people: Array<{ id: string; name: string }>;
}

const NEW = "__new__";

export function AcceptLinkForm({
  token,
  inviterName,
  households,
}: {
  token: string;
  inviterName: string;
  households: HouseholdOption[];
}) {
  const [householdId, setHouseholdId] = useState(households[0].id);
  const household = households.find((h) => h.id === householdId) ?? households[0];
  // Default to an existing person with a matching name, else "add them".
  const guess = household.people.find((p) => p.name.toLowerCase() === inviterName.toLowerCase());
  const [personChoice, setPersonChoice] = useState<string>(guess?.id ?? NEW);
  const [newName, setNewName] = useState(inviterName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (personChoice === NEW && !newName.trim()) return setError("Enter their name.");
    setPending(true);
    const res = await acceptLinkInviteAction({
      token,
      householdId,
      personId: personChoice === NEW ? null : personChoice,
      newName: personChoice === NEW ? newName.trim() : null,
    });
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <div className="flex flex-col gap-4">
      {households.length > 1 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="link-household">Connect which household?</Label>
          <select
            id="link-household"
            value={householdId}
            onChange={(e) => {
              setHouseholdId(e.target.value);
              setPersonChoice(NEW);
            }}
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="link-person">Who is {inviterName} in your People?</Label>
        <select
          id="link-person"
          value={personChoice}
          onChange={(e) => setPersonChoice(e.target.value)}
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          {household.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW}>Add them as a new person</option>
        </select>
      </div>
      {personChoice === NEW && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="link-new-name">Their name</Label>
          <Input id="link-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={() => void submit()} disabled={pending}>
        {pending ? "Connecting…" : "Connect"}
      </Button>
    </div>
  );
}
