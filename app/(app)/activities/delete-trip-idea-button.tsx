"use client";

import { deleteTripIdeaAction } from "./actions";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

export function DeleteTripIdeaButton({ tripIdeaId }: { tripIdeaId: string }) {
  return <ConfirmDeleteButton action={() => deleteTripIdeaAction(tripIdeaId)} />;
}
