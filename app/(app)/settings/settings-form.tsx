"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { updateHouseholdSettingsAction, type SettingsFormState } from "./actions";
import type { HouseholdRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getTimezoneOptions } from "@/lib/timezones";
import { TimezoneCombobox } from "@/components/ui/timezone-combobox";
import { useFormValidity } from "@/lib/hooks/use-form-validity";

const initialState: SettingsFormState = { error: null, saved: false };

export function SettingsForm({
  household,
  timezone,
  homeAddress,
}: {
  household: HouseholdRow;
  timezone: string;
  homeAddress: string;
}) {
  const [state, dispatch, pending] = useActionState(updateHouseholdSettingsAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const { invalid, checkValid, clearInvalid } = useFormValidity(formRef);
  const [errorDismissed, setErrorDismissed] = useState(false);
  // Was free text (Phase 3 backlog) — a typo ("Amercia/Los_Angeles") or a
  // made-up zone used to save silently and just quietly break every
  // time-based feature (brief timing, custody-block times) with no
  // indication why. A real IANA zone list removes that failure mode
  // entirely. If the currently-saved value somehow isn't in the list
  // (e.g. it predates this change and was already invalid), it's added
  // so the select still shows the true saved value instead of silently
  // switching to the first option.
  const timezoneOptions = useMemo(() => {
    const zones = getTimezoneOptions();
    return zones.includes(timezone) ? zones : [timezone, ...zones];
  }, [timezone]);

  // The only cross-field validation error this form can produce ("Max
  // must be at least the minimum.") concerns budgetMax specifically —
  // mirrors the gift-budget form's own min/max field, moved under that
  // field and cleared on edit instead of sitting as one generic message
  // near Save (KNOWN-ISSUES.md 1.3). Every other validation failure here
  // (bad household name, bad brief time) is rare enough that the generic
  // placement below still covers it.
  const isBudgetError = (message: string) => /budget|max must be/i.test(message);
  const isAddressError = (message: string) => /address/i.test(message);
  const budgetError = state.error && isBudgetError(state.error) && !errorDismissed ? state.error : null;
  const addressError = state.error && isAddressError(state.error) && !errorDismissed ? state.error : null;
  const otherError = state.error && !isBudgetError(state.error) && !isAddressError(state.error) ? state.error : null;

  // Dispatching manually on click, rather than binding the action to the
  // form's `action` prop, works around a live production bug where Next's
  // native <form action={fn}> submission mechanism reliably fails for any
  // Server Action nested under an auth-checking layout — see
  // DECISIONS.md D-031. dispatch() is the same useActionState-managed
  // function either way; only how it's invoked changes.
  function handleSave() {
    if (!checkValid()) return;
    setErrorDismissed(false);
    dispatch(new FormData(formRef.current!));
  }

  return (
    <Card>
      <CardContent>
        <form ref={formRef} noValidate onChange={clearInvalid} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="householdName">Household name</Label>
            <Input id="householdName" name="householdName" defaultValue={household.name} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="budgetMin">Default gift budget min ($)</Label>
              <Input
                id="budgetMin"
                name="budgetMin"
                type="number"
                min={0}
                step={1}
                defaultValue={household.default_gift_budget_min_cents ? household.default_gift_budget_min_cents / 100 : ""}
                onChange={() => setErrorDismissed(true)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="budgetMax">Default gift budget max ($)</Label>
              <Input
                id="budgetMax"
                name="budgetMax"
                type="number"
                min={0}
                step={1}
                defaultValue={household.default_gift_budget_max_cents ? household.default_gift_budget_max_cents / 100 : ""}
                aria-invalid={!!budgetError || undefined}
                onChange={() => setErrorDismissed(true)}
              />
              {budgetError && <p className="text-xs text-destructive">{budgetError}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="briefTime">Daily brief time</Label>
            <Input id="briefTime" name="briefTime" type="time" defaultValue={household.brief_time} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Notification delivery</Label>
            <p className="text-xs text-muted-foreground">
              Your daily brief and other alerts always show up in the notification bell in the app. Choose any
              other ways you&apos;d like to hear about them too.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="notifyEmail"
                defaultChecked={household.notification_channels.includes("email")}
              />{" "}
              Email
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="notifyPush"
                defaultChecked={household.notification_channels.includes("push")}
                disabled
              />{" "}
              Push notifications (coming soon — requires the mobile app)
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Custody calendar</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="calendarHideOtherParentCustody"
                defaultChecked={household.calendar_hide_other_parent_custody}
              />{" "}
              Only show my own custody days on the main calendar
            </label>
            <p className="text-xs text-muted-foreground">
              Uncheck to also show days the kids are with the other parent inline. The full custody schedule is
              always available on the Custody calendar view either way.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="giftScanHorizonDays">Gift scan horizon (days)</Label>
            <Input
              id="giftScanHorizonDays"
              name="giftScanHorizonDays"
              type="number"
              min={1}
              step={1}
              defaultValue={household.gift_scan_horizon_days}
            />
            <p className="text-xs text-muted-foreground">
              How far ahead to look for birthdays and other occasions when suggesting gifts.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tsaBufferMinutes">TSA buffer for flights (minutes)</Label>
            <Input
              id="tsaBufferMinutes"
              name="tsaBufferMinutes"
              type="number"
              min={0}
              max={600}
              step={5}
              placeholder="120 (default)"
              defaultValue={household.tsa_buffer_minutes ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              How long before a flight&apos;s departure time you want to be through security. Used when a flight is
              added from a screenshot or forwarded email. Leave blank to use the default of 120 minutes.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="homeAddress">Home address</Label>
            <Input
              id="homeAddress"
              name="homeAddress"
              placeholder="e.g. 123 Main St, Eugene, OR"
              defaultValue={homeAddress}
              aria-invalid={!!addressError || undefined}
              onChange={() => setErrorDismissed(true)}
            />
            {addressError && <p className="text-xs text-destructive">{addressError}</p>}
            <p className="text-xs text-muted-foreground">
              Used for weekend-plan suggestions and the weather in your daily brief. We look up the coordinates
              automatically — no need to know your exact latitude/longitude.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <TimezoneCombobox id="timezone" name="timezone" options={timezoneOptions} defaultValue={timezone} />
          </div>

          {invalid && <p className="text-sm text-destructive">Please fill in the required fields above.</p>}
          {otherError && <p className="text-sm text-destructive">{otherError}</p>}
          {state.saved && !state.error && <p className="text-sm text-muted-foreground">Saved.</p>}
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
