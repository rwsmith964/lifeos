"use client";

import { useActionState, useRef, useTransition } from "react";
import { X } from "lucide-react";
import {
  addInterestAction,
  addBudgetAction,
  recordGiftAction,
  setCadenceAction,
  logInteractionAction,
  deleteInterestAction,
  deleteBudgetAction,
  deleteGiftAction,
  generateSuggestionsAction,
  type SimpleFormState,
  type GenerateSuggestionsState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SimpleFormState = { error: null };

const OCCASION_OPTIONS = ["birthday", "christmas", "anniversary", "graduation", "just_because", "default"] as const;
const REACTION_OPTIONS = ["", "loved_it", "liked_it", "neutral", "missed"] as const;
const STRENGTH_OPTIONS = ["casual", "regular", "passionate"] as const;

// Every form below dispatches useActionState's action manually on button
// click, reading FormData from a ref, rather than binding it to the form's
// `action` prop. Native <form action={fn}> submission reliably fails for
// any Server Action nested under (app)'s auth-checking layout in
// production — see DECISIONS.md D-031. dispatch() is the same
// useActionState-managed function either way; only how it's invoked
// changes, and reportValidity() keeps native required/min/max validation
// working the same as a real submit would.

export function AddInterestForm({ personId }: { personId: string }) {
  const action = addInterestAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  function handleAdd() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    dispatch(new FormData(formRef.current));
  }

  return (
    <form ref={formRef} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`interest-${personId}`} className="text-xs">
          Interest
        </Label>
        <Input id={`interest-${personId}`} name="interest" placeholder="fly fishing" required className="h-8 w-40" />
      </div>
      <select
        name="strength"
        defaultValue="casual"
        aria-label="Interest strength"
        className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
      >
        {STRENGTH_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Add
      </Button>
      {state.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function AddBudgetForm({ personId }: { personId: string }) {
  const action = addBudgetAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  function handleAdd() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    dispatch(new FormData(formRef.current));
  }

  return (
    <form ref={formRef} className="flex flex-wrap items-end gap-2">
      <select
        name="occasionType"
        defaultValue="default"
        aria-label="Occasion"
        className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
      >
        {OCCASION_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <Input name="minDollars" type="number" min={0} placeholder="Min $" required className="h-8 w-20" />
      <Input name="maxDollars" type="number" min={0} placeholder="Max $" required className="h-8 w-20" />
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Add
      </Button>
      {state.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function RecordGiftForm({ personId }: { personId: string }) {
  const action = recordGiftAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  function handleRecord() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    dispatch(new FormData(formRef.current));
  }

  return (
    <form ref={formRef} className="flex flex-col gap-2">
      <Input name="description" placeholder="What did you give them?" required />
      <div className="flex gap-2">
        <select
          name="occasionType"
          defaultValue="just_because"
          aria-label="Occasion"
          className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          {OCCASION_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <Input name="occasionDate" type="date" required className="h-8" aria-label="Occasion date" />
      </div>
      <div className="flex gap-2">
        <Input name="costDollars" type="number" min={0} placeholder="Cost $" className="h-8" />
        <select
          name="reaction"
          defaultValue=""
          aria-label="Their reaction"
          className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          {REACTION_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r ? r.replace("_", " ") : "reaction (optional)"}
            </option>
          ))}
        </select>
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="button" size="sm" onClick={handleRecord} disabled={pending}>
        Record gift
      </Button>
    </form>
  );
}

const initialGenerateState: GenerateSuggestionsState = { error: null, success: false };

export function GenerateSuggestionsForm({ personId }: { personId: string }) {
  const action = generateSuggestionsAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialGenerateState);
  const formRef = useRef<HTMLFormElement>(null);

  function handleGenerate() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    dispatch(new FormData(formRef.current));
  }

  return (
    <form ref={formRef} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          name="occasionType"
          defaultValue="just_because"
          aria-label="Occasion"
          className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          {OCCASION_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <Input name="occasionDate" type="date" required className="h-8" aria-label="Occasion date" />
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.success && <p className="text-xs text-muted-foreground">Done — see the Gifts tab.</p>}
      <Button type="button" size="sm" variant="secondary" onClick={handleGenerate} disabled={pending}>
        {pending ? "Thinking…" : "Get gift ideas"}
      </Button>
    </form>
  );
}

export function CadenceForm({ personId, currentDays }: { personId: string; currentDays: number | null }) {
  const action = setCadenceAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSet() {
    if (!formRef.current || !formRef.current.reportValidity()) return;
    dispatch(new FormData(formRef.current));
  }

  return (
    <form ref={formRef} className="flex items-end gap-2">
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
      <Button type="button" size="sm" variant="secondary" onClick={handleSet} disabled={pending}>
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

export function DeleteInterestButton({ personId, interestId }: { personId: string; interestId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="Remove interest"
      disabled={pending}
      className="ml-1 inline-flex items-center align-middle text-muted-foreground hover:text-destructive disabled:opacity-50"
      onClick={() => startTransition(() => deleteInterestAction(personId, interestId))}
    >
      <X className="size-3" />
    </button>
  );
}

export function DeleteBudgetButton({ personId, budgetId }: { personId: string; budgetId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => startTransition(() => deleteBudgetAction(personId, budgetId))}
    >
      Remove
    </Button>
  );
}

export function DeleteGiftButton({ personId, giftId }: { personId: string; giftId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => startTransition(() => deleteGiftAction(personId, giftId))}
    >
      Remove
    </Button>
  );
}
