"use client";

import { deleteCalendarEventAction, deleteCustodyBlockAction } from "./actions";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

export function DeleteCalendarItemButton({ id, kind }: { id: string; kind: "event" | "custody" }) {
  const action = kind === "event" ? deleteCalendarEventAction : deleteCustodyBlockAction;

  return (
    <ConfirmDeleteButton
      variant="icon"
      ariaLabel={kind === "event" ? "Delete event" : "Delete custody block"}
      action={() => action(id)}
    />
  );
}
