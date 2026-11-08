"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { regenerateBriefAction } from "./actions";
import { Button } from "@/components/ui/button";

// B6 (audit pass 2026-09-11): "Rebuild" was a one-word technical verb with
// no feedback beyond the label swapping to "Rebuilding..." for ~25s, and
// nothing said what actually changed afterward. Renamed to "Refresh
// briefing" (the outcome, not the mechanism); the pending state now reads
// as real progress copy instead of a bare gerund; and a successful refresh
// shows a short "Updated: ..." / "Nothing changed." note for a few seconds
// instead of silently snapping back to normal.
const CHANGES_NOTE_VISIBLE_MS = 6000;

export function RegenerateBriefButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [changesSummary, setChangesSummary] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!changesSummary) return;
    const timer = setTimeout(() => setChangesSummary(null), CHANGES_NOTE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [changesSummary]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setChangesSummary(null);
            const result = await regenerateBriefAction();
            setError(result.error);
            setChangesSummary(result.changesSummary);
            // D-051 found that a bare await-then-revalidatePath round trip
            // doesn't reliably re-render the already-mounted tree in this
            // app's setup — router.refresh() forces it explicitly.
            if (!result.error) router.refresh();
          })
        }
      >
        {pending ? (
          <>
            <Loader2 className="size-3 animate-spin" /> Checking weather and your calendar…
          </>
        ) : (
          <>
            <RefreshCw className="size-3" /> Refresh briefing
          </>
        )}
      </Button>
      {error && <p className="font-sans text-metadata text-destructive">{error}</p>}
      {changesSummary && !error && <p className="font-sans text-metadata text-meta">{changesSummary}</p>}
    </div>
  );
}
