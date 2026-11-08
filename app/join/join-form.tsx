"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimPersonAction } from "./actions";

interface ClaimablePerson {
  id: string;
  name: string;
  detail: string;
}

const NEW_PERSON = "__new__";

export function JoinForm({
  householdId,
  people,
  defaultName,
}: {
  householdId: string;
  people: ClaimablePerson[];
  defaultName: string;
}) {
  const [choice, setChoice] = useState(people.length > 0 ? "" : NEW_PERSON);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (!choice) return setError("Choose who you are, or add yourself.");
    if (choice === NEW_PERSON && !name.trim()) return setError("Enter your name.");
    setPending(true);
    const res = await claimPersonAction({
      householdId,
      personId: choice === NEW_PERSON ? null : choice,
      newName: choice === NEW_PERSON ? name.trim() : null,
    });
    // On success the action redirects; only an error comes back.
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Who are you?</legend>
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <input type="radio" name="who" checked={choice === p.id} onChange={() => setChoice(p.id)} />
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground">· {p.detail}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <input type="radio" name="who" checked={choice === NEW_PERSON} onChange={() => setChoice(NEW_PERSON)} />
            <span className="font-medium">{people.length > 0 ? "None of these — add me" : "Add me"}</span>
          </label>
        </fieldset>
        {choice === NEW_PERSON && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-name">Your name</Label>
            <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={() => void submit()} disabled={pending}>
          {pending ? "Joining…" : "Continue"}
        </Button>
      </CardContent>
    </Card>
  );
}
