"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { generateWeekendPlanAction } from "./actions";
import { useAiHealth } from "@/lib/hooks/use-ai-health";
import { Button } from "@/components/ui/button";

export function GenerateWeekendPlanButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { aiAvailable } = useAiHealth();

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        disabled={pending || aiAvailable === false}
        title={aiAvailable === false ? "Weekend planning is temporarily unavailable." : undefined}
        onClick={() =>
          startTransition(async () => {
            const result = await generateWeekendPlanAction();
            setError(result.error);
          })
        }
      >
        {pending ? (
          <>
            <Loader2 className="size-3 animate-spin" /> Thinking…
          </>
        ) : (
          "Generate weekend plan"
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
