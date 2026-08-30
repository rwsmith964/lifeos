"use client";

import { Check } from "lucide-react";
import { updateSuggestionStatusAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";

/**
 * P1-12: Save previously had no toast, no badge, no saved-gifts list
 * anywhere, and Dismiss deleted the card with no undo. Now:
 * - Save shows a success toast and the card flips to a "Saved" badge with
 *   Move back / Dismiss actions (and shows up in the new Saved gifts view).
 * - Dismiss always offers an Undo action in its toast that restores the
 *   suggestion to whatever status it had before (suggested or saved).
 */
export function GiftSuggestionActions({
  suggestionId,
  status,
}: {
  suggestionId: string;
  status: "suggested" | "saved";
}) {
  const save = useAsyncToastAction(() => updateSuggestionStatusAction(suggestionId, "saved"), {
    successMessage: "Saved to shortlist.",
    successDescription: "Find it anytime in Saved gifts.",
  });
  const unsave = useAsyncToastAction(() => updateSuggestionStatusAction(suggestionId, "suggested"), {
    successMessage: "Moved back to suggestions.",
  });
  const dismiss = useAsyncToastAction(() => updateSuggestionStatusAction(suggestionId, "dismissed"), {
    successMessage: "Dismissed.",
    onUndo: () => updateSuggestionStatusAction(suggestionId, status),
    undoMessage: status === "saved" ? "Restored to Saved gifts." : "Restored to suggestions.",
  });

  if (status === "saved") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <Check className="size-3" aria-hidden="true" />
          Saved
        </Badge>
        <Button size="sm" variant="outline" disabled={unsave.pending} onClick={unsave.run}>
          {unsave.pending ? "Moving…" : "Move back"}
        </Button>
        <Button size="sm" variant="ghost" disabled={dismiss.pending} onClick={dismiss.run}>
          {dismiss.pending ? "Dismissing…" : "Dismiss"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" disabled={save.pending} onClick={save.run}>
        {save.pending ? "Saving…" : "Save"}
      </Button>
      <Button size="sm" variant="outline" disabled={dismiss.pending} onClick={dismiss.run}>
        {dismiss.pending ? "Dismissing…" : "Dismiss"}
      </Button>
    </div>
  );
}
