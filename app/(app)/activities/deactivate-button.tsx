"use client";

import { deactivateActivityAction } from "./actions";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

export function DeactivateActivityButton({ activityId }: { activityId: string }) {
  return <ConfirmDeleteButton action={() => deactivateActivityAction(activityId)} />;
}
