"use client";

// Suggested travel and prep blocks for upcoming events, each with Add and
// Dismiss. Times arrive pre-formatted from the server: calendar times are
// stored as floating wall-clock values, so formatting them in the browser's
// own timezone here would shift them.
import { useState } from "react";
import { Car, ClipboardList, Pencil, ShoppingBasket, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  /** Wall-clock parts for the edit form: yyyy-MM-dd and HH:mm. */
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeLabel: string;
  tight: boolean;
}

function nextDay(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SuggestionRow({ s, showDay }: { s: SuggestionView; showDay: boolean }) {
  // Change the title or time before adding -- a suggested time is a starting point.
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [date, setDate] = useState(s.startDate);
  const [startTime, setStartTime] = useState(s.startTime);
  const [endTime, setEndTime] = useState(s.endTime);
  const changed = title.trim() !== s.title || date !== s.startDate || startTime !== s.startTime || endTime !== s.endTime;

  const accept = useAsyncToastAction(
    async () => {
      const endDate = changed ? (endTime > startTime ? date : nextDay(date)) : s.endDate;
      const res = await acceptSuggestionAction({
        kind: s.kind,
        eventId: s.eventId,
        suffix: s.suffix,
        title: changed && title.trim() ? title.trim() : s.title,
        detail: s.detail,
        startsAtISO: s.startsAtISO,
        endsAtISO: s.endsAtISO,
        ...(changed && date && startTime && endTime
          ? { startsAtLocal: `${date}T${startTime}`, endsAtLocal: `${endDate}T${endTime}` }
          : {}),
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
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          <Pencil className="size-3.5" aria-hidden /> Edit
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={dismiss.run}>
          Dismiss
        </Button>
      </div>
      {editing && (
        <div className="grid w-full grid-cols-3 gap-2">
          <div className="col-span-3 flex flex-col gap-1">
            <Label>What</Label>
            <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="col-span-3 flex flex-col gap-1 sm:col-span-1">
            <Label>Day</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>From</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>To</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
      )}
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
