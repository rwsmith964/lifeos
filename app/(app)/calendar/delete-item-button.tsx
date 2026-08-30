"use client";

import { useRef } from "react";
import {
  deleteCalendarEventAction,
  deleteCustodyBlockAction,
  deleteTimeOffFromCalendarAction,
  getCalendarEventSnapshotAction,
  restoreCalendarEventAction,
  type CalendarEventUndoSnapshot,
} from "./actions";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

export function DeleteCalendarItemButton({ id, kind }: { id: string; kind: "event" | "custody" | "time_off" }) {
  const action =
    kind === "event" ? deleteCalendarEventAction : kind === "custody" ? deleteCustodyBlockAction : deleteTimeOffFromCalendarAction;
  const ariaLabel = kind === "event" ? "Delete event" : kind === "custody" ? "Delete custody block" : "Delete time off";
  // Populated by `action` (below) right before the row is deleted, so
  // `onUndo` -- which only runs later, after the user clicks the toast's
  // Undo button -- has the data to recreate it. The row is gone from the
  // DB by the time onUndo would ever run, so it can't just re-fetch by id.
  const snapshotRef = useRef<CalendarEventUndoSnapshot | null>(null);

  // Only real calendar_events rows (kind === "event") support Undo — custody
  // blocks and time off are handled by dedicated forms elsewhere and don't
  // yet have a snapshot/restore path (P2 sweep can extend this).
  if (kind === "event") {
    return (
      <ConfirmDeleteButton
        variant="icon"
        ariaLabel={ariaLabel}
        dialogTitle="Delete this event?"
        successMessage="Event deleted."
        action={async () => {
          snapshotRef.current = await getCalendarEventSnapshotAction(id);
          return deleteCalendarEventAction(id);
        }}
        onUndo={async () => {
          const snapshot = snapshotRef.current;
          if (!snapshot) throw new Error("Nothing to restore");
          const result = await restoreCalendarEventAction(snapshot);
          if (result.error) throw new Error(result.error);
        }}
      />
    );
  }

  return <ConfirmDeleteButton variant="icon" ariaLabel={ariaLabel} action={() => action(id)} />;
}
