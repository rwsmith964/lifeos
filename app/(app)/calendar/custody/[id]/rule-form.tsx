"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonRow } from "@/lib/db/database.types";
import { ORDINAL_LABELS, WEEKDAY_LABELS } from "@/lib/custody/monthly-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass = "border-input h-9 rounded-md border bg-transparent px-3 text-sm";
const ORDINALS = [1, 2, 3, 4, -1] as const;

/**
 * Adds a repeating variation to the normal pattern -- "the other parent has
 * the kids on the first Saturday of every month." Same idea as a one-day
 * exception, but it recurs, so it doesn't need re-entering each month.
 */
export function RuleForm({
  scheduleId,
  responsibleCandidates,
}: {
  scheduleId: string;
  responsibleCandidates: PersonRow[];
}) {
  const router = useRouter();
  const [ordinal, setOrdinal] = useState<number>(1);
  const [dayOfWeek, setDayOfWeek] = useState<number>(6);
  const [responsiblePersonId, setResponsiblePersonId] = useState(responsibleCandidates[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!responsiblePersonId) {
      setError("Pick who has the kids on those days.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/custody/schedules/${scheduleId}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ordinal,
          day_of_week: dayOfWeek,
          responsible_person_id: responsiblePersonId,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't save this variation.");
        setPending(false);
        return;
      }
      setReason("");
      router.refresh();
      setPending(false);
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ruleOrdinal">Which one</Label>
          <select id="ruleOrdinal" className={selectClass} value={ordinal} onChange={(e) => setOrdinal(Number(e.target.value))}>
            {ORDINALS.map((o) => (
              <option key={o} value={o}>
                {ORDINAL_LABELS[o][0]!.toUpperCase() + ORDINAL_LABELS[o].slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ruleWeekday">Day of the week</Label>
          <select id="ruleWeekday" className={selectClass} value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
            {WEEKDAY_LABELS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ruleResponsible">Kids are with</Label>
          <select
            id="ruleResponsible"
            className={selectClass}
            value={responsiblePersonId}
            onChange={(e) => setResponsiblePersonId(e.target.value)}
          >
            {responsibleCandidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname || p.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ruleReason">Note (optional)</Label>
        <Input id="ruleReason" placeholder="e.g. Mel's first-Saturday day" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSubmit} disabled={pending} size="sm" className="self-start">
        {pending ? "Saving…" : "Add repeating variation"}
      </Button>
    </div>
  );
}
