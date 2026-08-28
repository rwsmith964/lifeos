"use client";

import { cancelChildcareRequestAction } from "./childcare-actions";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

export function CancelChildcareRequestButton({ requestId }: { requestId: string }) {
  return (
    <ConfirmDeleteButton
      label="Cancel"
      confirmLabel="Confirm cancel"
      action={() => cancelChildcareRequestAction(requestId)}
    />
  );
}
