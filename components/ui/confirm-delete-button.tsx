"use client";

import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmDelete } from "@/lib/hooks/use-confirm-delete";
import { cn } from "@/lib/utils";

interface ConfirmDeleteButtonProps {
  /** Server action to run on confirm. Should return `{ error: string | null }`. */
  action: () => Promise<{ error: string | null } | void>;
  /** Label shown before arming, e.g. "Remove" or "Delete". Defaults to "Remove". */
  label?: string;
  /** Label shown once armed. Defaults to "Confirm delete". */
  confirmLabel?: string;
  size?: "sm" | "default" | "icon";
  /** Render as a small icon-only button (matches the compact "X" style used for inline chips). */
  variant?: "button" | "icon";
  className?: string;
  ariaLabel?: string;
}

/**
 * Shared two-click delete confirmation, replacing every instant-delete
 * button across activities, gifts, interests, budgets, and calendar events
 * (KNOWN-ISSUES.md 1.5). First click arms the button ("Confirm delete?"),
 * a second click within 4s actually deletes; the arm auto-resets otherwise.
 * Mirrors the pattern already shipped for custody schedule deletion.
 */
export function ConfirmDeleteButton({
  action,
  label = "Remove",
  confirmLabel = "Confirm delete",
  size = "sm",
  variant = "button",
  className,
  ariaLabel,
}: ConfirmDeleteButtonProps) {
  const { armed, pending, error, trigger, cancel } = useConfirmDelete(async () => {
    const result = await action();
    if (result && result.error) throw new Error(result.error);
  });

  if (variant === "icon") {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          aria-label={armed ? `${ariaLabel ?? "Delete"} \u2014 click again to confirm` : ariaLabel ?? "Delete"}
          disabled={pending}
          onClick={trigger}
          className={cn(
            "inline-flex items-center align-middle disabled:opacity-50",
            armed ? "text-destructive" : "text-muted-foreground hover:text-destructive",
            className
          )}
        >
          <X className="size-3" />
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size={size}
          variant={armed ? "destructive" : "ghost"}
          disabled={pending}
          onClick={trigger}
          className={className}
        >
          {variant === "button" && <Trash2 className="size-3.5" />}
          {pending ? "Removing\u2026" : armed ? confirmLabel : label}
        </Button>
        {armed && !pending && (
          <Button type="button" size={size} variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
