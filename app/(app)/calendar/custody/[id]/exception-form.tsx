"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass = "border-input h-9 rounded-md border bg-transparent px-3 text-sm";

/** Adds a single-day override to a recurring custody schedule — e.g. "Dad has Emma on Thanksgiving even though it's normally Mom's week." Re-materializes the schedule's rolling window on save so the calendar picks up the change immediately. */
export function ExceptionForm({
  scheduleId,
  responsibleCandidates,
}: {
  scheduleId: string;
  responsibleCandidates: PersonRow[];
}) {
  const router = useRouter();
  const [exceptionDate, setExceptionDate] = useState("");
  const [responsiblePersonId, setResponsiblePersonId] = useState(responsibleCandidates[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!exceptionDate || !responsiblePersonId) {
      setError("Pick a date and who's responsible that day.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/custody/schedules/${scheduleId}/exceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exception_date: exceptionDate,
          responsible_person_id: responsiblePersonId,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't save this exception.");
        setPending(false);
        return;
      }
      setExceptionDate("");
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
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="exceptionDate">Date</Label>
          <Input
            id="exceptionDate"
            type="date"
            value={exceptionDate}
            onChange={(e) => setExceptionDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="responsiblePersonId">Responsible that day</Label>
          <select
            id="responsiblePersonId"
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
        <Label htmlFor="reason">Reason (optional)</Label>
        <Input
          id="reason"
          placeholder="e.g. Thanksgiving swap"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={handleSubmit} disabled={pending} size="sm" className="self-start">
        {pending ? "Saving…" : "Add exception"}
      </Button>
    </div>
  );
}
