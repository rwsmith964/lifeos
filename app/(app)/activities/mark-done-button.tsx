"use client";

import { useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { markActivityDoneTodayAction } from "./actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

// D-083 (P3-1): quick action alongside Edit/Deactivate — no confirm dialog
// (unlike ConfirmDeleteButton) since this isn't destructive and is easy to
// correct afterwards by editing the activity's "Last done" date directly.
export function MarkDoneButton({ activityId }: { activityId: string }) {
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleClick() {
    startTransition(async () => {
      const result = await markActivityDoneTodayAction(activityId);
      if (result.error) {
        showToast({ title: "Couldn't save", description: result.error, variant: "destructive" });
      } else {
        showToast({ title: "Marked as done today.", variant: "success" });
      }
    });
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-8"
      disabled={pending}
      onClick={handleClick}
      aria-label="Mark done today"
      title="Mark done today"
    >
      <CalendarCheck className="size-4" />
    </Button>
  );
}
