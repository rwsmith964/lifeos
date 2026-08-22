"use client";

import { useTransition } from "react";
import { updateSuggestionStatusAction } from "./actions";
import { Button } from "@/components/ui/button";

export function GiftSuggestionActions({ suggestionId }: { suggestionId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => startTransition(() => updateSuggestionStatusAction(suggestionId, "saved"))}
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => updateSuggestionStatusAction(suggestionId, "dismissed"))}
      >
        Dismiss
      </Button>
    </div>
  );
}
