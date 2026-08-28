"use client";

import { deleteCalendarEventAction, deleteCustodyBlockAction, deleteTimeOffFromCalendarAction } from "./actions";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

export function DeleteCalendarItemButton({ id, kind }: { id: string; kind: "event" | "custody" | "time_off" }) {
  const action =
    kind === "event" ? deleteCalendarEventAction : kind === "custody" ? deleteCustodyBlockAction : deleteTimeOffFromCalendarAction;
  const ariaLabel = kind === "event" ? "Delete event" : kind === "custody" ? "Delete custody block" : "Delete time off";

  return <ConfirmDeleteButton variant="icon" ariaLabel={ariaLabel} action={() => action(id)} />;
}
