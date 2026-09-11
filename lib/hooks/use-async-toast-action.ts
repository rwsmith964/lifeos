"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

/**
 * Shared feedback wrapper for non-destructive (or undo-covered) async
 * actions that don't need a confirmation dialog — e.g. Save/Unsave/Dismiss
 * on a gift suggestion (P1-12). Complements useConfirmDelete (which adds a
 * confirm step first); this is for actions where the ground rule "every
 * destructive or async action needs visible feedback (loading state,
 * success confirmation, and undo where possible)" is satisfied by a
 * pending state + toast + optional Undo, without an extra click to arm.
 */
interface UseAsyncToastActionOptions {
  successMessage: string;
  successDescription?: string;
  /** Recreates the prior state. When set, the success toast offers Undo. */
  onUndo?: () => Promise<void>;
  undoMessage?: string;
  errorMessage?: string;
}

export function useAsyncToastAction(action: () => Promise<void>, options: UseAsyncToastActionOptions) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  const { successMessage, successDescription, onUndo, undoMessage, errorMessage } = options;

  // Named function declaration (not a `const` arrow) so it can call itself
  // by name from the catch block below without a self-reference-before-
  // declaration issue -- that's the retry (Part 5 — States: Error:
  // "Inline and specific, scoped to the thing that failed, with a retry").
  // `attempt` already closes over everything this exact action needs, so
  // offering it back as the toast's own action button is a real retry, not
  // a generic "try again" that might do something else.
  function attempt() {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
        showToast({
          title: successMessage,
          description: successDescription,
          variant: "success",
          durationMs: onUndo ? 8000 : 6000,
          action: onUndo
            ? {
                label: "Undo",
                onClick: async () => {
                  try {
                    await onUndo();
                    router.refresh();
                    showToast({ title: undoMessage ?? "Restored.", variant: "default" });
                  } catch {
                    showToast({ title: "Couldn't undo that — please redo it manually.", variant: "destructive" });
                  }
                },
              }
            : undefined,
        });
      } catch (err) {
        showToast({
          title: errorMessage ?? "Something went wrong",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
          action: { label: "Retry", onClick: attempt },
        });
      }
    });
  }

  return { pending, run: attempt };
}
