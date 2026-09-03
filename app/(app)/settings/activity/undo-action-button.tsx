"use client";

// QUEUE-011 remainder: one-tap undo for an action_log entry. Built as its
// own small component rather than reusing ConfirmDeleteButton as-is --
// that component always renders a Trash2 icon (it's the shared *delete*
// confirmation primitive), which would read as "delete this log entry"
// instead of "reverse what the assistant did". Same useConfirmDelete +
// ConfirmDialog primitives underneath, so the pending/error/toast
// behavior matches every other destructive action in the app exactly.

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useConfirmDelete } from "@/lib/hooks/use-confirm-delete";
import { undoActionLogEntryAction } from "./actions";

export function UndoActionButton({ entryId }: { entryId: string }) {
  const { open, pending, error, requestConfirm, confirm, cancel } = useConfirmDelete(
    () => undoActionLogEntryAction(entryId),
    { successMessage: "Undone." }
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={requestConfirm}>
        <Undo2 className="size-3.5" />
        Undo
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ConfirmDialog
        open={open}
        title="Undo this action?"
        description="If the assistant created something, it will be removed. If it edited something, the previous values will be restored."
        confirmLabel="Undo"
        pending={pending}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </div>
  );
}
