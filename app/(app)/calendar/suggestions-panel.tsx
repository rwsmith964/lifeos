"use client";

// Suggested travel and prep blocks for upcoming events, each with Add and
// Dismiss. Times arrive pre-formatted from the server: calendar times are
// stored as floating wall-clock values, so formatting them in the browser's
// own timezone here would shift them.
import { Car, ClipboardList, ShoppingBasket, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { acceptSuggestionAction, dismissSuggestionAction } from "./suggestion-actions";
import { syncDepartureReminders } from "@/components/native/departure-reminders";

export interface SuggestionView {
  key: string;
  kind: "travel" | "prep" | "errand";
  eventId: string;
  suffix?: string;
  title: string;
  detail: string;
  startsAtISO: string;
  endsAtISO: string;
  /** e.g. "Mon, Nov 9" -- shown only when the list spans several days. */
  dayLabel: string;
  timeLabel: string;
  tight: boolean;
}

function SuggestionRow({ s, showDay }: { s: SuggestionView; showDay: boolean }) {
  const accept = useAsyncToastAction(
    async () => {
      const res = await acceptSuggestionAction({
        kind: s.kind,
        eventId: s.eventId,
        suffix: s.suffix,
        title: s.title,
        detail: s.detail,
        startsAtISO: s.startsAtISO,
        endsAtISO: s.endsAtISO,
      });
      if (res.error) throw new Error(res.error);
      // In the phone app, a new drive gets its leave-soon reminders right away.
      void syncDepartureReminders().catch(() => undefined);
    },
    { successMessage: "Added to your calendar.", errorMessage: "Couldn't add that" }
  );
  const dismiss = useAsyncToastAction(
    async () => {
      const res = await dismissSuggestionAction(s.kind, s.eventId, s.suffix);
      if (res.error) throw new Error(res.error);
    },
    { successMessage: "Dismissed.", errorMessage: "Couldn't dismiss that" }
  );
  const busy = accept.pending || dismiss.pending;
  const Icon = s.tight ? TriangleAlert : s.kind === "travel" ? Car : s.kind === "errand" ? ShoppingBasket : ClipboardList;

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-control border border-dashed border-line bg-surface px-3 py-2">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Icon className={s.tight ? "mt-0.5 size-4 shrink-0 text-amber-600" : "mt-0.5 size-4 shrink-0 text-meta"} aria-hidden />
        <div className="min-w-0">
          <p className="font-sans text-body font-bold text-ink">{s.title}</p>
          <p className="font-sans text-metadata text-meta">
            {showDay ? `${s.dayLabel} · ` : ""}
            {s.timeLabel}
          </p>
          <p className="font-sans text-metadata text-ink-2">{s.detail}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={accept.run}>
          Add
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={dismiss.run}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}

export function SuggestionsPanel({ suggestions, showDay }: { suggestions: SuggestionView[]; showDay: boolean }) {
  if (suggestions.length === 0) return null;
  return (
    <section aria-label="Suggestions" className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
      <div>
        <h2 className="font-sans text-body font-bold text-ink">Suggested for you</h2>
        <p className="font-sans text-metadata text-meta">
          Drive time and prep for what&apos;s coming up. Add the ones you want on your calendar.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <SuggestionRow key={s.key} s={s} showDay={showDay} />
        ))}
      </ul>
    </section>
  );
}
