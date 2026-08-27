"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { generateWeekendPlanAction } from "./actions";
import { useAiHealth } from "@/lib/hooks/use-ai-health";
import { Button } from "@/components/ui/button";

interface GenerateWeekendPlanButtonProps {
  // D-057: this button used to only render when no plan existed yet for
  // the weekend, with no way to refresh one already generated (e.g. after
  // adding a new activity, or once conditions/weather data changes). It's
  // now always shown; callers pass a variant-appropriate label/size.
  variant?: "generate" | "regenerate";
}

export function GenerateWeekendPlanButton({ variant = "generate" }: GenerateWeekendPlanButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { aiAvailable } = useAiHealth();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant={variant === "regenerate" ? "outline" : "default"}
        disabled={pending || aiAvailable === false}
        title={aiAvailable === false ? "Weekend planning is temporarily unavailable." : undefined}
        onClick={() =>
          startTransition(async () => {
            const result = await generateWeekendPlanAction();
            setError(result.error);
            // Same D-051 finding: revalidatePath alone doesn't reliably
            // re-render this already-mounted tree.
            if (!result.error) router.refresh();
          })
        }
      >
        {pending ? (
          <>
            <Loader2 className="size-3 animate-spin" /> Thinking…
          </>
        ) : variant === "regenerate" ? (
          "Regenerate weekend plan"
        ) : (
          "Generate weekend plan"
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
