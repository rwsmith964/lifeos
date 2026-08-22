"use client";

import { useTransition } from "react";
import { deactivateActivityAction } from "./actions";
import { Button } from "@/components/ui/button";

export function DeactivateActivityButton({ activityId }: { activityId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => startTransition(() => deactivateActivityAction(activityId))}
    >
      Remove
    </Button>
  );
}
