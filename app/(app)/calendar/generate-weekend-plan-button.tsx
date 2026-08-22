"use client";

import { useState, useTransition } from "react";
import { generateWeekendPlanAction } from "./actions";
import { Button } from "@/components/ui/button";

export function GenerateWeekendPlanButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await generateWeekendPlanAction();
            setError(result.error);
          })
        }
      >
        {pending ? "Thinking…" : "Generate weekend plan"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
