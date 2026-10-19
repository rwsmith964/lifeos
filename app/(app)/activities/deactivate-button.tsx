"use client";

import { deactivateActivityAction, reactivateActivityAction } from "./actions";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

export function DeactivateActivityButton({ activityId }: { activityId: string }) {
  return (
    <ConfirmDeleteButton
      action={() => deactivateActivityAction(activityId)}
      onUndo={async () => {
        const result = await reactivateActivityAction(activityId);
        if (result.error) throw new Error(result.error);
      }}
    />
  );
}
