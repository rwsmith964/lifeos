"use client";

// B1/B2 (audit pass 2026-09-11): the interactive part of each Today
// priority card -- "Nothing on Today can be done on Today" / "No card can
// be cleared." One small component per card kind, since each needs a
// different real action (Log contact vs. Accept vs. a meal picker), plus
// a shared Dismiss/Snooze pair every card gets.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { dismissTodayItemAction, logContactFromTodayAction, planDinnerFromTodayAction } from "./today-actions";
import { updateOpportunityStatusAction } from "./opportunities/actions";
import type { PriorityAction } from "@/lib/brief/today-priority-items";

function throwOnError(result: { error: string | null }) {
  if (result.error) throw new Error(result.error);
}

/** Every card gets these two -- persisted via today_item_dismissals so a dismissed/snoozed item stays gone across brief regenerations (B2). */
function DismissSnoozeButtons({ itemKey }: { itemKey: string }) {
  const dismiss = useAsyncToastAction(() => dismissTodayItemAction(itemKey, "dismiss").then(throwOnError), {
    successMessage: "Dismissed for today.",
    errorMessage: "Couldn't dismiss that",
  });
  const snooze = useAsyncToastAction(() => dismissTodayItemAction(itemKey, "snooze").then(throwOnError), {
    successMessage: "Snoozed for 3 days.",
    errorMessage: "Couldn't snooze that",
  });

  return (
    <>
      <Button variant="ghost" size="sm" disabled={snooze.pending} onClick={snooze.run}>
        Snooze 3 days
      </Button>
      <Button variant="ghost" size="sm" disabled={dismiss.pending} onClick={dismiss.run}>
        Dismiss
      </Button>
    </>
  );
}

export function ReachOutCardActions({
  itemKey,
  personId,
  primaryAction,
}: {
  itemKey: string;
  personId?: string;
  primaryAction: PriorityAction;
}) {
  const logContact = useAsyncToastAction(
    () => logContactFromTodayAction(personId!).then(throwOnError),
    { successMessage: "Logged.", errorMessage: "Couldn't log that contact" }
  );

  return (
    <>
      <Button asChild size="sm">
        <Link href={primaryAction.href}>{primaryAction.label}</Link>
      </Button>
      {personId && (
        <Button variant="outline" size="sm" disabled={logContact.pending} onClick={logContact.run}>
          Log contact
        </Button>
      )}
      <DismissSnoozeButtons itemKey={itemKey} />
    </>
  );
}

export function DecideCardActions({
  itemKey,
  opportunityId,
  primaryAction,
}: {
  itemKey: string;
  opportunityId?: string;
  primaryAction: PriorityAction;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "dismiss" | null>(null);

  // A real opportunity backs this card -- accept/dismiss act on it
  // directly (same status values the Opportunities page itself uses), so
  // "Accept" here and "Acted on" there always agree.
  if (opportunityId) {
    return (
      <>
        <Button
          size="sm"
          disabled={pending !== null}
          onClick={async () => {
            setPending("accept");
            await updateOpportunityStatusAction(opportunityId, "acted_on");
            router.refresh();
            setPending(null);
          }}
        >
          Accept
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending !== null}
          onClick={async () => {
            setPending("dismiss");
            await updateOpportunityStatusAction(opportunityId, "dismissed");
            router.refresh();
            setPending(null);
          }}
        >
          Dismiss
        </Button>
      </>
    );
  }

  // No structured opportunity behind this one (the legacy single-AI-
  // recommendation fallback, only ever shown when there are zero real
  // opportunities) -- nothing to accept, so it's a link plus the same
  // generic Dismiss/Snooze every card gets.
  return (
    <>
      <Button asChild size="sm">
        <Link href={primaryAction.href}>{primaryAction.label}</Link>
      </Button>
      <DismissSnoozeButtons itemKey={itemKey} />
    </>
  );
}

export function DinnerCardActions({ itemKey, primaryAction }: { itemKey: string; primaryAction: PriorityAction }) {
  const [meal, setMeal] = useState("");
  const plan = useAsyncToastAction(() => planDinnerFromTodayAction(meal).then(throwOnError), {
    successMessage: "Dinner planned.",
    errorMessage: "Couldn't plan that meal",
  });

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={meal}
          onChange={(e) => setMeal(e.target.value)}
          placeholder="e.g. tacos, leftovers, eating out"
          className="h-9 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && meal.trim()) plan.run();
          }}
        />
        <Button size="sm" disabled={plan.pending || !meal.trim()} onClick={plan.run}>
          Plan it
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={primaryAction.href}>{primaryAction.label}</Link>
        </Button>
        <DismissSnoozeButtons itemKey={itemKey} />
      </div>
    </div>
  );
}

export function QuickCardActions({ itemKey, primaryAction }: { itemKey: string; primaryAction: PriorityAction }) {
  return (
    <>
      <Button asChild variant="outline" size="sm">
        <Link href={primaryAction.href}>{primaryAction.label}</Link>
      </Button>
      <DismissSnoozeButtons itemKey={itemKey} />
    </>
  );
}
