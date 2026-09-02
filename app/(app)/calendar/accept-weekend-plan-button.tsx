"use client";

// D-131: turns the AI's recommended weekend activity into a real
// calendar_events row (and a prep-time block, when the activity needs
// one) with one click. Mirrors GenerateWeekendPlanButton's
// pending/error/router.refresh() pattern.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CalendarCheck2 } from "lucide-react";
import { acceptWeekendPlanAction } from "./actions";
import { Button } from "@/components/ui/button";

export function AcceptWeekendPlanButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [prepSkippedNotice, setPrepSkippedNotice] = useState(false);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptWeekendPlanAction();
            setError(result.error);
            setPrepSkippedNotice(!result.error && result.prepSkipped);
            // Same D-051 finding as the generate button: revalidatePath
            // alone doesn't reliably re-render this already-mounted tree.
            if (!result.error) router.refresh();
          })
        }
      >
        {pending ? (
          <>
            <Loader2 className="size-3 animate-spin" /> Adding…
          </>
        ) : (
          <>
            <CalendarCheck2 className="size-3" /> Add to calendar
          </>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {prepSkippedNotice && (
        <p className="text-xs text-muted-foreground">
          Added to your calendar. This activity usually needs prep time, but no open slot was found beforehand — add
          it manually if you&apos;d like a reminder.
        </p>
      )}
    </div>
  );
}
