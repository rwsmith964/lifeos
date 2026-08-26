"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteScheduleButton({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/custody/schedules/${scheduleId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't delete this schedule.");
        setPending(false);
        setConfirming(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setPending(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={confirming ? "destructive" : "ghost"}
        onClick={handleDelete}
        disabled={pending}
      >
        <Trash2 className="size-3.5" />
        {confirming ? "Confirm delete" : ""}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
