"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import {
  addInterestAction,
  addSuggestedInterestAction,
  addBudgetAction,
  addGiftSiteAction,
  recordGiftAction,
  updateGiftAction,
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
  addChildActivityAction,
  deleteChildActivityAction,
  setChildActivityAttendanceAction,
  type SimpleFormState,
  type GenerateSuggestionsState,
} from "./actions";
import type { ChildActivityAttendanceRow, ChildActivityRow, PersonRow } from "@/lib/db/database.types";
import { useAiHealth } from "@/lib/hooks/use-ai-health";
import { useFormValidity } from "@/lib/hooks/use-form-validity";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { Badge } from "@/components/ui/badge";
import { estimateAgeYears } from "@/lib/ai/prompts/gift-suggestion";
import { suggestedInterestsFor } from "@/lib/people/demographic-interests";
import { giftReactionDisplayLabel, occasionTypeDisplayLabel } from "@/lib/gifts/occasions";
import type { OccasionType, GiftReaction } from "@/lib/db/database.types";
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

// D-137: demographic-based interest suggestion bubbles. One click adds the
// suggestion as a "casual" interest via the same upsert path as the typed
// form above (addSuggestedInterestAction). A bubble disappears once its
// interest is on the person's list (revalidatePath refreshes
// `existingInterests` from the server after add), so this never offers a
// duplicate. Suggestions are age-bucketed (birthdate -> estimateAgeYears,
// same helper gift suggestions use) with a relationship_type fallback when
// age is unknown — see lib/people/demographic-interests.ts for the source
// list and QUEUE-040 for why there's no gender dimension.
export function SuggestedInterestBubbles({
  personId,
  birthdate,
  birthYearKnown,
  relationshipType,
  existingInterests,
}: {
  personId: string;
  birthdate: PersonRow["birthdate"];
  birthYearKnown: boolean;
  relationshipType: PersonRow["relationship_type"];
  existingInterests: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const ageYears = estimateAgeYears(birthdate, birthYearKnown, new Date());
  const already = new Set(existingInterests.map((i) => i.trim().toLowerCase()));
  const suggestions = suggestedInterestsFor(ageYears, relationshipType).filter(
    (s) => !already.has(s.interest.toLowerCase())
  );

  if (suggestions.length === 0) return null;

  const visible = expanded ? suggestions : suggestions.slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">Popular ideas to consider — click to add</p>
      <div className="flex flex-wrap gap-2">
        {visible.map((suggestion) => (
          <SuggestionBubble key={suggestion.interest} personId={personId} suggestion={suggestion} />
        ))}
        {!expanded && suggestions.length > visible.length && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpanded(true)}>
            + {suggestions.length - visible.length} more
          </Button>
        )}
      </div>
    </div>
  );
}

function SuggestionBubble({
  personId,
  suggestion,
}: {
  personId: string;
  suggestion: { interest: string; category: string };
}) {
  const { pending, run } = useAsyncToastAction(
    () => addSuggestedInterestAction(personId, suggestion.interest, suggestion.category),
    {
      successMessage: `Added "${suggestion.interest}".`,
      errorMessage: "Couldn't add that interest",
    }
  );
  return (
    <Badge
      variant="outline"
      role="button"
      tabIndex={0}
      aria-label={`Add interest: ${suggestion.interest}`}
      aria-disabled={pending}
      className="hover:bg-accent cursor-pointer select-none"
      onClick={pending ? undefined : run}
      onKeyDown={(e) => {
        if (!pending && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          run();
        }
      }}
    >
      {pending ? "Adding…" : `+ ${suggestion.interest}`}
    </Badge>
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

// D-094: inline edit for an already-recorded gift. Mirrors RecordGiftForm's
// fields exactly (same occasion/reaction option lists, same validation
// message) so editing feels like the same form, just pre-filled and with
// "Save changes" / "Cancel" instead of "Record gift". Rendered in place of
// the static row by GiftHistoryItem below, not as its own always-visible
// form -- there's no natural standalone location for it on the page.
function EditGiftForm({
  personId,
  gift,
  onDone,
  onCancel,
}: {
  personId: string;
  gift: { id: string; description: string; occasion_type: OccasionType; occasion_date: string; cost_cents: number | null; reaction: GiftReaction | null };
  onDone: () => void;
  onCancel: () => void;
}) {
  const action = updateGiftAction.bind(null, personId, gift.id);
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const justSubmittedRef = useRef(false);

  function handleSave() {
    if (!checkValid()) return;
    justSubmittedRef.current = true;
    dispatch(new FormData(formRef.current!));
  }

  useEffect(() => {
    if (justSubmittedRef.current && !state.error) {
      onDone();
    }
    justSubmittedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2">
      <Input name="description" defaultValue={gift.description} placeholder="What did you give them?" required />
      <div className="flex gap-2">
        <select
          name="occasionType"
          defaultValue={gift.occasion_type}
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
          defaultValue={gift.occasion_date}
          required
          className="h-8"
          aria-label="Occasion date"
        />
      </div>
      <div className="flex gap-2">
        <Input
          name="costDollars"
          type="number"
          min={0}
          defaultValue={gift.cost_cents != null ? (gift.cost_cents / 100).toFixed(2) : ""}
          placeholder="Cost $"
          className="h-8"
        />
        <select
          name="reaction"
          defaultValue={gift.reaction ?? ""}
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
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function GiftHistoryItem({
  personId,
  gift,
}: {
  personId: string;
  gift: {
    id: string;
    description: string;
    occasion_type: OccasionType;
    occasion_date: string;
    cost_cents: number | null;
    reaction: GiftReaction | null;
  };
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditGiftForm personId={personId} gift={gift} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div>
        <p className="font-medium">{gift.description}</p>
        <p className="text-xs text-muted-foreground">
          {occasionTypeDisplayLabel(gift.occasion_type)} ·{" "}
          {format(new Date(`${gift.occasion_date}T00:00:00`), "EEEE, MMMM d")}
          {gift.cost_cents != null && ` · $${(gift.cost_cents / 100).toFixed(2)}`}
          {gift.reaction && ` · ${giftReactionDisplayLabel(gift.reaction)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <DeleteGiftButton personId={personId} giftId={gift.id} />
      </div>
    </div>
  );
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
      <div className="flex flex-col gap-1">
        <Label htmlFor={`timeoff-destination-${personId}`} className="text-xs">
          Destination (optional)
        </Label>
        <Input
          id={`timeoff-destination-${personId}`}
          name="destination"
          placeholder="Los Angeles, CA"
          className="h-8 w-40"
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

// D-129: a recurring weekly activity ("soccer practice Tue/Thu 4-5pm") for
// a child, plus an optional location. Mirrors AddWorkScheduleForm's
// manual dispatch() pattern exactly -- see that component's comment.
export function AddChildActivityForm({ childPersonId }: { childPersonId: string }) {
  const action = addChildActivityAction.bind(null, childPersonId);
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
        <Label htmlFor={`activity-name-${childPersonId}`} className="text-xs">
          Name
        </Label>
        <Input
          id={`activity-name-${childPersonId}`}
          name="name"
          placeholder="Soccer practice"
          required
          className="h-8 w-40"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`activity-type-${childPersonId}`} className="text-xs">
          Type (optional)
        </Label>
        <Input
          id={`activity-type-${childPersonId}`}
          name="activityType"
          placeholder="Sports"
          className="h-8 w-28"
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`activity-day-${childPersonId}`} className="text-xs">
          Day
        </Label>
        <select
          id={`activity-day-${childPersonId}`}
          name="dayOfWeek"
          defaultValue="2"
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
        <Label htmlFor={`activity-start-${childPersonId}`} className="text-xs">
          Start
        </Label>
        <Input
          id={`activity-start-${childPersonId}`}
          name="startTime"
          type="time"
          required
          defaultValue="16:00"
          className="h-8 w-28"
          aria-invalid={!!showError || undefined}
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`activity-end-${childPersonId}`} className="text-xs">
          End
        </Label>
        <Input
          id={`activity-end-${childPersonId}`}
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
        <Label htmlFor={`activity-location-name-${childPersonId}`} className="text-xs">
          Location (optional)
        </Label>
        <Input
          id={`activity-location-name-${childPersonId}`}
          name="locationName"
          placeholder="Field name"
          className="h-8 w-32"
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`activity-location-address-${childPersonId}`} className="text-xs">
          Address (optional)
        </Label>
        <Input
          id={`activity-location-address-${childPersonId}`}
          name="locationAddress"
          placeholder="Address"
          className="h-8 w-40"
          onChange={() => setErrorDismissed(true)}
        />
      </div>
      {showError && <p className="text-xs text-destructive">{state.error}</p>}
      {invalid && !showError && <p className="text-xs text-destructive">Name, start time, and end time are required.</p>}
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
        Add activity
      </Button>
    </form>
  );
}

export function DeleteChildActivityButton({ childPersonId, activityId }: { childPersonId: string; activityId: string }) {
  return (
    <ConfirmDeleteButton
      variant="icon"
      ariaLabel="Remove activity"
      className="ml-1"
      action={() => deleteChildActivityAction(childPersonId, activityId)}
    />
  );
}

// Raw enum values never reach the user (standing UI rule) -- pair each
// attendance_status value with a display label, same pattern as
// occasionTypeDisplayLabel/giftReactionDisplayLabel elsewhere in this file.
const ATTENDANCE_OPTIONS: { value: "required" | "optional" | "informational"; label: string }[] = [
  { value: "required", label: "Must attend" },
  { value: "optional", label: "Optional" },
  { value: "informational", label: "FYI only" },
];

/**
 * One activity's read-only summary plus a per-household-adult attendance
 * select -- "I have to go to games, not practices" (D-129). Each select
 * change sends the *entire* current entry set for this activity (matching
 * setAttendanceForActivity's replace-all semantics), built from the
 * already-loaded attendanceByPerson map with just that one adult's value
 * swapped in.
 */
export function ChildActivityListItem({
  childPersonId,
  activity,
  householdAdults,
  attendance,
}: {
  childPersonId: string;
  activity: ChildActivityRow;
  householdAdults: PersonRow[];
  attendance: ChildActivityAttendanceRow[];
}) {
  const [attendanceByPerson, setAttendanceByPerson] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const row of attendance) map[row.person_id] = row.attendance_status;
    return map;
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAttendanceChange(personId: string, status: string) {
    const next = { ...attendanceByPerson, [personId]: status };
    setAttendanceByPerson(next);
    setError(null);
    startTransition(async () => {
      const entries = householdAdults.map((adult) => ({
        person_id: adult.id,
        attendance_status: next[adult.id] ?? "optional",
      }));
      const result = await setChildActivityAttendanceAction(childPersonId, activity.id, entries);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b pb-2 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm">
          <p>
            <span className="font-medium">{DAY_OF_WEEK_LABELS[activity.day_of_week]}</span>{" "}
            <span className="text-muted-foreground">
              {activity.name} {activity.start_time}–{activity.end_time}
            </span>
          </p>
          {(activity.location_name || activity.location_address) && (
            <p className="text-xs text-muted-foreground">
              {[activity.location_name, activity.location_address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <DeleteChildActivityButton childPersonId={childPersonId} activityId={activity.id} />
      </div>
      {householdAdults.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {householdAdults.map((adult) => (
            <div key={adult.id} className="flex items-center gap-1">
              <Label htmlFor={`attendance-${activity.id}-${adult.id}`} className="text-xs text-muted-foreground">
                {adult.full_name}
              </Label>
              <select
                id={`attendance-${activity.id}-${adult.id}`}
                value={attendanceByPerson[adult.id] ?? "optional"}
                disabled={isPending}
                onChange={(e) => handleAttendanceChange(adult.id, e.target.value)}
                className="border-input h-7 rounded-md border bg-transparent px-1 text-xs"
              >
                {ATTENDANCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {isPending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
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
