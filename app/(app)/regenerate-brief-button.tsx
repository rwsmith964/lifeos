"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { regenerateBriefAction } from "./actions";
import { Button } from "@/components/ui/button";

export function RegenerateBriefButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await regenerateBriefAction();
            setError(result.error);
            // D-051 found that a bare await-then-revalidatePath round trip
            // doesn't reliably re-render the already-mounted tree in this
            // app's setup — router.refresh() forces it explicitly.
            if (!result.error) router.refresh();
          })
        }
      >
        {pending ? (
          <>
            <Loader2 className="size-3 animate-spin" /> Refreshing…
          </>
        ) : (
          <>
            <RefreshCw className="size-3" /> Refresh brief
          </>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
