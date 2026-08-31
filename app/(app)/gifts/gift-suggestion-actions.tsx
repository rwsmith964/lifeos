"use client";

import { useRef } from "react";
import { Check, Package } from "lucide-react";
import { markSuggestionGivenAction, undoMarkGivenAction, updateSuggestionStatusAction } from "./actions";
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
 *
 * P3-4: extends the same card into the full shortlist lifecycle spec'd as
 * "Saved -> Ordered -> Given, writing 'Given' into Gift history":
 * - Saved -> "Mark ordered" moves to the Ordered state (still shown on the
 *   Saved gifts page, so nothing silently disappears when you order it).
 * - Ordered -> "Mark given" is the terminal step. It writes a permanent
 *   entry to the recipient's Gift history and retires the suggestion
 *   (status converted_to_gift) so it drops off every list. Because that
 *   history write is real and permanent, its Undo (unlike the others)
 *   also deletes the gift row it just created — not just a status flip.
 */
export function GiftSuggestionActions({
  suggestionId,
  status,
}: {
  suggestionId: string;
  status: "suggested" | "saved" | "ordered";
}) {
  const lastGivenGiftId = useRef<string | null>(null);

  const save = useAsyncToastAction(() => updateSuggestionStatusAction(suggestionId, "saved"), {
    successMessage: "Saved to shortlist.",
    successDescription: "Find it anytime in Saved gifts.",
  });
  const unsave = useAsyncToastAction(() => updateSuggestionStatusAction(suggestionId, "suggested"), {
    successMessage: "Moved back to suggestions.",
  });
  const markOrdered = useAsyncToastAction(() => updateSuggestionStatusAction(suggestionId, "ordered"), {
    successMessage: "Marked as ordered.",
    onUndo: () => updateSuggestionStatusAction(suggestionId, "saved"),
    undoMessage: "Moved back to Saved.",
  });
  const moveBackToSaved = useAsyncToastAction(() => updateSuggestionStatusAction(suggestionId, "saved"), {
    successMessage: "Moved back to Saved.",
  });
  const markGiven = useAsyncToastAction(
    async () => {
      lastGivenGiftId.current = await markSuggestionGivenAction(suggestionId);
    },
    {
      successMessage: "Marked as given.",
      successDescription: "Added to their Gift history.",
      onUndo: () => undoMarkGivenAction(suggestionId, lastGivenGiftId.current as string),
      undoMessage: "Restored to Ordered.",
    }
  );
  const dismiss = useAsyncToastAction(() => updateSuggestionStatusAction(suggestionId, "dismissed"), {
    successMessage: "Dismissed.",
    onUndo: () => updateSuggestionStatusAction(suggestionId, status),
    undoMessage: status === "saved" || status === "ordered" ? "Restored to Saved gifts." : "Restored to suggestions.",
  });

  if (status === "ordered") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <Package className="size-3" aria-hidden="true" />
          Ordered
        </Badge>
        <Button size="sm" disabled={markGiven.pending} onClick={markGiven.run}>
          {markGiven.pending ? "Marking given…" : "Mark given"}
        </Button>
        <Button size="sm" variant="outline" disabled={moveBackToSaved.pending} onClick={moveBackToSaved.run}>
          {moveBackToSaved.pending ? "Moving…" : "Move back"}
        </Button>
        <Button size="sm" variant="ghost" disabled={dismiss.pending} onClick={dismiss.run}>
          {dismiss.pending ? "Dismissing…" : "Dismiss"}
        </Button>
      </div>
    );
  }

  if (status === "saved") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <Check className="size-3" aria-hidden="true" />
          Saved
        </Badge>
        <Button size="sm" disabled={markOrdered.pending} onClick={markOrdered.run}>
          {markOrdered.pending ? "Marking ordered…" : "Mark ordered"}
        </Button>
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
