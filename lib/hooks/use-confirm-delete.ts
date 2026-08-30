"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

/**
 * Shared delete-confirmation flow (P0-1). Opens a real confirmation dialog
 * (see components/ui/confirm-delete-button.tsx) rather than the earlier
 * two-click "arm" pattern, which testing showed produced no visible
 * feedback on the first click and was easy to miss entirely. On success,
 * shows a toast — with an Undo action when the caller supplied one — and
 * forces a fresh server render via router.refresh() so the change is
 * reflected immediately without waiting for Next's revalidation signal to
 * be picked up by an already-mounted tree (see D-051 for background on why
 * that extra refresh is needed here).
 *
 * `action` should reject/throw on failure (server actions here already
 * return `{ error }` shapes via `friendlyMutationError` — pass a wrapper
 * that throws `new Error(result.error)` when present).
 */
function isNextNavigationSignal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (error as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))
  );
}

interface UseConfirmDeleteOptions {
  /** Recreates the deleted record. When set, the success toast offers Undo. */
  onUndo?: () => Promise<void>;
  successMessage?: string;
}

export function useConfirmDelete(action: () => Promise<void> | void, options: UseConfirmDeleteOptions = {}) {
  const { onUndo, successMessage = "Deleted." } = options;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  const requestConfirm = useCallback(() => {
    setError(null);
    setOpen(true);
  }, []);

  const cancel = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const confirm = useCallback(() => {
    startTransition(async () => {
      try {
        await action();
        setOpen(false);
        router.refresh();
        showToast({
          title: successMessage,
          variant: "success",
          action: onUndo
            ? {
                label: "Undo",
                onClick: async () => {
                  try {
                    await onUndo();
                    router.refresh();
                    showToast({ title: "Restored.", variant: "default" });
                  } catch {
                    showToast({ title: "Couldn't undo that — please redo it manually.", variant: "destructive" });
                  }
                },
              }
            : undefined,
        });
      } catch (err) {
        if (isNextNavigationSignal(err)) throw err;
        setOpen(false);
        setError(err instanceof Error ? err.message : "Couldn't delete that — please try again.");
        showToast({ title: "Couldn't delete that", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      }
    });
  }, [action, router, showToast, onUndo, successMessage]);

  return { open, pending, error, requestConfirm, confirm, cancel };
}
