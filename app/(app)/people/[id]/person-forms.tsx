"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import {
  addInterestAction,
  addBudgetAction,
  addGiftSiteAction,
  recordGiftAction,
  setCadenceAction,
  logInteractionAction,
  deleteInterestAction,
  deleteBudgetAction,
  deleteGiftSiteAction,
  deleteGiftAction,
  generateSuggestionsAction,
  addWorkScheduleAction,
  deleteWorkScheduleAction,
  addTimeOffAction,
  deleteTimeOffAction,
  type SimpleFormState,
  type GenerateSuggestionsState,
} from "./actions";
import { useAiHealth } from "@/lib/hooks/use-ai-health";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import { giftReactionDisplayLabel, occasionTypeDisplayLabel } from "@/lib/gifts/occasions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SimpleFormState = { error: null };

const OCCASION_OPTIONS = ["birthday", "christmas", "anniversary", "graduation", "just_because", "default"] as const;
const REACTION_OPTIONS = ["", "loved_it", "liked_it", "neutral", "missed"] as const;
const STRENGTH_OPTIONS = ["casual", "regular", "passionate"] as const;
// index = day_of_week (0 = Sunday .. 6 = Saturday), matches Date#getDay()
// and work_schedules.day_of_week -- see lib/calendar/work-schedule.ts.
const DAY_OF_WEEK_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

// Every form below dispatches useActionState's action manually on button
// click, reading FormData from a ref, rather than binding it to the form's
// `action` prop. Native <form action={fn}> submission reliably fails for
// any Server Action nested under (app)'s auth-checking layout in
// production — see DECISIONS.md D-031. dispatch() is the same
// useActionState-managed function either way; only how it's invoked
// changes. Each form used reportValidity() to keep native required/min/
// max validation working the same as a real submit would, but that also
// pops the browser's own unstyled validation tooltip (D-079/P2-5) -- now
// checkValidity() (silent, same pass/fail check) plus useFormValidity's
// `invalid` flag drives one small inline message instead, next to each
// form's existing server-error slot.

export function AddInterestForm({ personId }: { personId: string }) {
  const action = addInterestAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  // Clear the input (and reset the strength select) after a successful
  // add, not just on error — leaving the just-added word sitting there
  // was what invited a second click that used to crash the app (D-032).
  useEffect(() => {
    if (justSubmittedRef.current && !state.error) {
      formRef.current?.reset();
    }
    justSubmittedRef.current = false;
  }, [state]);

  // "interest" is the only field validation can meaningfully fail on
  // (blank/too-long text) — shown right under it and cleared as soon as
  // the user edits it, instead of a generic message under the whole row
  // (KNOWN-ISSUES.md 1.3).
  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`interest-${personId}`} className="text-xs">
          Interest
        </Label>
        <Input
          id={`interest-${personId}`}
          name="interest"
          placeholder="fly fishing"
          required
          className="h-8 w-40"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
        {showError && <p className="text-xs text-destructive">{state.error}</p>}
        {invalid && !showError && <p className="text-xs text-destructive">Interest is required.</p>}
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
    </form>
  );
}

export function AddBudgetForm({ personId }: { personId: string }) {
  const action = addBudgetAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false); // a fresh submit is about to produce a fresh result either way
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) {
      formRef.current?.reset();
    }
    justSubmittedRef.current = false;
  }, [state]);

  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-wrap items-end gap-2">
      <select
        name="occasionType"
        defaultValue="default"
        aria-label="Occasion"
        className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
      >
        {OCCASION_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {occasionTypeDisplayLabel(o)}
          </option>
        ))}
      </select>
      <Input
        name="minDollars"
        type="number"
        min={0}
        placeholder="Min $"
        required
        className="h-8 w-20"
        onChange={() => setErrorDismissed(true)}
      />
      <div className="flex flex-col gap-1">
        <Input
          name="maxDollars"
          type="number"
          min={0}
          placeholder="Max $"
          required
          className="h-8 w-20"
          aria-invalid={showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
        {showError && <p className="text-xs text-destructive">{state.error}</p>}
        {invalid && !showError && <p className="text-xs text-destructive">Min and max budget are required.</p>}
      </div>
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Add
      </Button>
    </form>
  );
}

export function RecordGiftForm({ personId }: { personId: string }) {
  const action = recordGiftAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);

  function handleRecord() {
    if (!checkValid()) return;
    dispatch(new FormData(formRef.current!));
  }

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-2">
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
              {occasionTypeDisplayLabel(o)}
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
              {r ? giftReactionDisplayLabel(r) : "reaction (optional)"}
            </option>
          ))}
        </select>
      </div>
      {invalid && <p className="text-xs text-destructive">Description and occasion date are required.</p>}
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="button" size="sm" onClick={handleRecord} disabled={pending}>
        Record gift
      </Button>
    </form>
  );
}

const initialGenerateState: GenerateSuggestionsState = { error: null, success: false };

export function GenerateSuggestionsForm({
  personId,
  defaultOccasionType = "just_because",
  defaultOccasionDate,
}: {
  personId: string;
  /** P1-9: the person's nearest real upcoming occasion, computed server-side — falls back to "just_because" only when none exists (e.g. excluded person). */
  defaultOccasionType?: (typeof OCCASION_OPTIONS)[number];
  defaultOccasionDate?: string;
}) {
  const action = generateSuggestionsAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialGenerateState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const { aiAvailable } = useAiHealth();
  const router = useRouter();

  function handleGenerate() {
    // The date field is `required` with no default — a click while it's
    // still empty was silently swallowed by native reportValidity() with
    // no visible feedback ("first click does nothing"). Defaulting the
    // field means this path is now rarely hit, but it's still a no-op
    // rather than a silent one if it is.
    if (!checkValid()) return;
    dispatch(new FormData(formRef.current!));
  }

  // D-082 (P2-7): the ~10s generation used to just flip a small "Done" line
  // in place with no way to see the result short of remembering to visit
  // /gifts yourself. Results always land on /gifts (generateSuggestionsAction
  // revalidates that path, never this page), so a run that actually produced
  // new ideas navigates there automatically. When nothing new came back
  // (state.message is only set on that empty-result branch) there's nothing
  // to navigate to -- stay put and show the explanatory message instead.
  useEffect(() => {
    if (state.success && !state.message) {
      router.push("/gifts");
    }
  }, [state, router]);

  const disabled = pending || aiAvailable === false;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          name="occasionType"
          defaultValue={defaultOccasionType}
          aria-label="Occasion"
          className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          {OCCASION_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {occasionTypeDisplayLabel(o)}
            </option>
          ))}
        </select>
        <Input
          name="occasionDate"
          type="date"
          required
          defaultValue={defaultOccasionDate ?? new Date().toISOString().slice(0, 10)}
          className="h-8"
          aria-label="Occasion date"
        />
      </div>
      {invalid && <p className="text-xs text-destructive">An occasion date is required.</p>}
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.success && (
        <p className="text-xs text-muted-foreground">{state.message ?? "Done — see the Gifts tab."}</p>
      )}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={handleGenerate}
        disabled={disabled}
        title={aiAvailable === false ? "Gift ideas are temporarily unavailable." : undefined}
      >
        {pending ? (
          <>
            <Loader2 className="size-3 animate-spin" /> Reading through that…
          </>
        ) : (
          "Get gift ideas"
        )}
      </Button>
    </form>
  );
}

export function CadenceForm({ personId, currentDays }: { personId: string; currentDays: number | null }) {
  const action = setCadenceAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const [errorDismissed, setErrorDismissed] = useState(false);

  function handleSet() {
    if (!checkValid()) return;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  // "targetIntervalDays" is the only field here, so no field-matching is
  // needed — just move the message under it and clear on edit
  // (KNOWN-ISSUES.md 1.3).
  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex items-end gap-2">
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
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
        {showError && <p className="text-xs text-destructive">{state.error}</p>}
        {invalid && !showError && <p className="text-xs text-destructive">Enter a valid number of days.</p>}
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={handleSet} disabled={pending}>
        Set
      </Button>
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
  return (
    <ConfirmDeleteButton
      variant="icon"
      ariaLabel="Remove interest"
      className="ml-1"
      action={() => deleteInterestAction(personId, interestId)}
    />
  );
}

export function DeleteBudgetButton({ personId, budgetId }: { personId: string; budgetId: string }) {
  return <ConfirmDeleteButton action={() => deleteBudgetAction(personId, budgetId)} />;
}

// D-063: the "save site" action from the spec — bookmarking a preferred
// gift-shopping site for this person. Mirrors AddInterestForm exactly
// (manual dispatch() on click, not native form action — D-031).
export function AddGiftSiteForm({ personId }: { personId: string }) {
  const action = addGiftSiteAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) {
      formRef.current?.reset();
    }
    justSubmittedRef.current = false;
  }, [state]);

  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`gift-site-label-${personId}`} className="text-xs">
          Site name
        </Label>
        <Input
          id={`gift-site-label-${personId}`}
          name="label"
          placeholder="Etsy"
          required
          className="h-8 w-32"
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`gift-site-url-${personId}`} className="text-xs">
          URL
        </Label>
        <Input
          id={`gift-site-url-${personId}`}
          name="url"
          type="url"
          placeholder="https://www.etsy.com"
          required
          className="h-8 w-56"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="text-xs text-destructive">Site name and URL are required.</p>}
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Save site
      </Button>
    </form>
  );
}

export function DeleteGiftButton({ personId, giftId }: { personId: string; giftId: string }) {
  return <ConfirmDeleteButton action={() => deleteGiftAction(personId, giftId)} />;
}

export function DeleteGiftSiteButton({ personId, siteId }: { personId: string; siteId: string }) {
  return (
    <ConfirmDeleteButton
      variant="icon"
      ariaLabel="Remove gift site"
      className="ml-1"
      action={() => deleteGiftSiteAction(personId, siteId)}
    />
  );
}

// D-064: a recurring weekly work shift ("works Wednesdays 9am-5pm"). Mirrors
// AddGiftSiteForm's manual dispatch() pattern (D-031) exactly.
export function AddWorkScheduleForm({ personId }: { personId: string }) {
  const action = addWorkScheduleAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) {
      formRef.current?.reset();
    }
    justSubmittedRef.current = false;
  }, [state]);

  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`work-day-${personId}`} className="text-xs">
          Day
        </Label>
        <select
          id={`work-day-${personId}`}
          name="dayOfWeek"
          defaultValue="1"
          aria-label="Day of the week"
          className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
          onChange={() => setErrorDismissed(true)}
        >
          {DAY_OF_WEEK_LABELS.map((day, index) => (
            <option key={day} value={index}>
              {day}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`work-start-${personId}`} className="text-xs">
          Start
        </Label>
        <Input
          id={`work-start-${personId}`}
          name="startTime"
          type="time"
          required
          defaultValue="09:00"
          className="h-8 w-28"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`work-end-${personId}`} className="text-xs">
          End
        </Label>
        <Input
          id={`work-end-${personId}`}
          name="endTime"
          type="time"
          required
          defaultValue="17:00"
          className="h-8 w-28"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`work-label-${personId}`} className="text-xs">
          Label
        </Label>
        <Input
          id={`work-label-${personId}`}
          name="label"
          placeholder="Work"
          defaultValue="Work"
          required
          className="h-8 w-24"
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="text-xs text-destructive">Start time, end time, and label are required.</p>}
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Add shift
      </Button>
    </form>
  );
}

export function DeleteWorkScheduleButton({ personId, scheduleId }: { personId: string; scheduleId: string }) {
  return (
    <ConfirmDeleteButton
      variant="icon"
      ariaLabel="Remove shift"
      className="ml-1"
      action={() => deleteWorkScheduleAction(personId, scheduleId)}
    />
  );
}

// D-064: a specific dated time-off entry (vacation, sick day, appointment).
// Same manual-dispatch pattern (D-031).
export function AddTimeOffForm({ personId }: { personId: string }) {
  const action = addTimeOffAction.bind(null, personId);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  function handleAdd() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) {
      formRef.current?.reset();
    }
    justSubmittedRef.current = false;
  }, [state]);

  const showError = state.error && !errorDismissed;

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`timeoff-start-${personId}`} className="text-xs">
          From
        </Label>
        <Input
          id={`timeoff-start-${personId}`}
          name="startDate"
          type="date"
          required
          className="h-8 w-36"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`timeoff-end-${personId}`} className="text-xs">
          Through (optional)
        </Label>
        <Input
          id={`timeoff-end-${personId}`}
          name="endDate"
          type="date"
          className="h-8 w-36"
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`timeoff-reason-${personId}`} className="text-xs">
          Reason (optional)
        </Label>
        <Input
          id={`timeoff-reason-${personId}`}
          name="reason"
          placeholder="Vacation"
          className="h-8 w-36"
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="text-xs text-destructive">A start date is required.</p>}
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Add time off
      </Button>
    </form>
  );
}

export function DeleteTimeOffButton({ personId, entryId }: { personId: string; entryId: string }) {
  return (
    <ConfirmDeleteButton
      variant="icon"
      ariaLabel="Remove time off"
      className="ml-1"
      action={() => deleteTimeOffAction(personId, entryId)}
    />
  );
}
