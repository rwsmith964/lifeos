"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { deleteCalendarEventAction, deleteCustodyBlockAction } from "./actions";

export function DeleteCalendarItemButton({ id, kind }: { id: string; kind: "event" | "custody" }) {
  const [pending, startTransition] = useTransition();
  const action = kind === "event" ? deleteCalendarEventAction : deleteCustodyBlockAction;

  return (
    <button
      type="button"
      aria-label="Delete"
      disabled={pending}
      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
      onClick={() => startTransition(() => action(id))}
    >
      <X className="size-4" />
    </button>
  );
}
