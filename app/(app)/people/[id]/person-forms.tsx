"use client";

import { useActionState, useTransition } from "react";
import {
  addInterestAction,
  addBudgetAction,
  recordGiftAction,
  setCadenceAction,
  logInteractionAction,
  type SimpleFormState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SimpleFormState = { error: null };

const OCCASION_OPTIONS = ["birthday", "christmas", "anniversary", "graduation", "just_because", "default"] as const;
const REACTION_OPTIONS = ["", "loved_it", "liked_it", "neutral", "missed"] as const;
const STRENGTH_OPTIONS = ["casual", "regular", "passionate"] as const;

export function AddInterestForm({ personId }: { personId: string }) {
  const action = addInterestAction.bind(null, personId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`interest-${personId}`} className="text-xs">
          Interest
        </Label>
        <Input id={`interest-${personId}`} name="interest" placeholder="fly fishing" required className="h-8 w-40" />
      </div>
      <select name="strength" defaultValue="casual" className="border-input h-8 rounded-md border bg-transparent px-2 text-sm">
        {STRENGTH_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        Add
      </Button>
      {state.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function AddBudgetForm({ personId }: { personId: string }) {
  const action = addBudgetAction.bind(null, personId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="occasionType" defaultValue="default" className="border-input h-8 rounded-md border bg-transparent px-2 text-sm">
        {OCCASION_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <Input name="minDollars" type="number" min={0} placeholder="Min $" required className="h-8 w-20" />
      <Input name="maxDollars" type="number" min={0} placeholder="Max $" required className="h-8 w-20" />
      <Button type="submit" size="sm" disabled={pending}>
        Add
      </Button>
      {state.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function RecordGiftForm({ personId }: { personId: string }) {
  const action = recordGiftAction.bind(null, personId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Input name="description" placeholder="What did you give them?" required />
      <div className="flex gap-2">
        <select name="occasionType" defaultValue="just_because" className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm">
          {OCCASION_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <Input name="occasionDate" type="date" required className="h-8" />
      </div>
      <div className="flex gap-2">
        <Input name="costDollars" type="number" min={0} placeholder="Cost $" className="h-8" />
        <select name="reaction" defaultValue="" className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm">
          {REACTION_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r ? r.replace("_", " ") : "reaction (optional)"}
            </option>
          ))}
        </select>
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        Record gift
      </Button>
    </form>
  );
}

export function CadenceForm({ personId, currentDays }: { personId: string; currentDays: number | null }) {
  const action = setCadenceAction.bind(null, personId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`cadence-${personId}`} className="text-xs">
          Check in every (days)
        </Label>
        <Input
          id={`cadence-${personId}`}
          name="targetIntervalDays"
          type="number"
          min={1}
          defaultValue={currentDays ?? 30}
          className="h-8 w-20"
        />
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Set
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function LogInteractionButton({ personId }: { personId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => logInteractionAction(personId))}
    >
      Log contact today
    </Button>
  );
}
