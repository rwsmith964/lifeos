"use client";

import { deleteMyAccountAction } from "./account-actions";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

/**
 * App Store readiness (Apple Guideline 5.1.1(v)): the only account-deletion
 * path before this was app/support/page.tsx's "email us" instruction, which
 * doesn't satisfy the guideline's "initiate deletion from within the app"
 * requirement. deleteMyAccountAction() redirects to /account-deleted on
 * success (no toast to show -- there's no page left to show it on), or
 * returns an error (e.g. "transfer ownership first") that renders inline
 * the same way every other ConfirmDeleteButton call site's error does.
 */
export function DeleteAccountButton() {
  return (
    <ConfirmDeleteButton
      action={deleteMyAccountAction}
      label="Delete my account"
      confirmLabel="Delete my account"
      dialogTitle="Delete your account?"
      dialogDescription="This permanently deletes your login and, for any household only you belong to, every person, event, gift, and note in it. This can't be undone."
    />
  );
}
