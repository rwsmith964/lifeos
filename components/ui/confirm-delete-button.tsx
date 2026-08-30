"use client";

import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useConfirmDelete } from "@/lib/hooks/use-confirm-delete";
import { cn } from "@/lib/utils";

interface ConfirmDeleteButtonProps {
  /** Server action to run on confirm. Should return `{ error: string | null }`. */
  action: () => Promise<{ error: string | null } | void>;
  /** Label shown on the button before the confirmation dialog opens. Defaults to "Remove". */
  label?: string;
  /** Label shown on the dialog's confirm button. Defaults to "Delete". */
  confirmLabel?: string;
  /** Dialog title. Defaults to a generic "Delete this?" phrased around `label`. */
  dialogTitle?: string;
  /** Dialog body copy. Defaults to a generic warning, or an undo hint when `onUndo` is set. */
  dialogDescription?: string;
  size?: "sm" | "default" | "icon";
  /** Render as a small icon-only button (matches the compact "X" style used for inline chips). */
  variant?: "button" | "icon";
  className?: string;
  ariaLabel?: string;
  /**
   * When provided, a success toast offers an "Undo" action that calls this
   * to recreate the deleted record. Callers should capture the record's
   * fields *before* calling `action` (e.g. in an onClick closure) since the
   * row will be gone from the database once delete succeeds.
   */
  onUndo?: () => Promise<void>;
  /** Toast message shown after a successful delete. Defaults to "Deleted." */
  successMessage?: string;
}

/**
 * Shared delete confirmation: a real modal dialog (not a two-click button,
 * which testing showed was too undiscoverable — see P0-1) plus a success
 * toast with an optional Undo action. Used across activities, gifts,
 * interests, budgets, custody schedule, and calendar events/custody/time
 * off so every destructive action in the app gets the same feedback.
 */
export function ConfirmDeleteButton({
  action,
  label = "Remove",
  confirmLabel = "Delete",
  dialogTitle,
  dialogDescription,
  size = "sm",
  variant = "button",
  className,
  ariaLabel,
  onUndo,
  successMessage = "Deleted.",
}: ConfirmDeleteButtonProps) {
  const { open, pending, error, requestConfirm, confirm, cancel } = useConfirmDelete(async () => {
    const result = await action();
    if (result && result.error) throw new Error(result.error);
  }, { onUndo, successMessage });

  const title = dialogTitle ?? `${label}?`;
  const description =
    dialogDescription ?? (onUndo ? "You'll be able to undo this from a confirmation that appears after." : "This can't be undone.");

  if (variant === "icon") {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          aria-label={ariaLabel ?? "Delete"}
          disabled={pending}
          onClick={requestConfirm}
          className={cn("inline-flex items-center align-middle text-muted-foreground hover:text-destructive disabled:opacity-50", className)}
        >
          <X className="size-3" />
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
        <ConfirmDialogPortal
          open={open}
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          pending={pending}
          onConfirm={confirm}
          onCancel={cancel}
        />
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size={size} variant="ghost" disabled={pending} onClick={requestConfirm} className={className}>
        {variant === "button" && <Trash2 className="size-3.5" />}
        {label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ConfirmDialogPortal
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        pending={pending}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </div>
  );
}

// Split out purely so the two return branches above don't duplicate the
// dialog JSX — the dialog itself renders through a portal so its position
// in this tree doesn't matter.
function ConfirmDialogPortal(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return <ConfirmDialog {...props} destructive />;
}
