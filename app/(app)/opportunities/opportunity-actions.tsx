"use client";

import { useTransition } from "react";
import { updateOpportunityStatusAction } from "./actions";
import { Button } from "@/components/ui/button";

export function OpportunityActions({ opportunityId }: { opportunityId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => startTransition(() => updateOpportunityStatusAction(opportunityId, "acted_on"))}
      >
        Acted on
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => updateOpportunityStatusAction(opportunityId, "dismissed"))}
      >
        Dismiss
      </Button>
    </div>
  );
}
