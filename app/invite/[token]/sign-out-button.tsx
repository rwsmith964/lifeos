"use client";

import { useTransition } from "react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";

// Direct call via startTransition, not a <form action={signOut}> binding —
// same pattern as app/(app)/sign-out-button.tsx (D-031). This page isn't
// under app/(app)'s layout so the form-binding bug wouldn't actually apply
// here, but there's no reason to introduce a second, less-proven pattern
// for the exact same "call a redirecting Server Action from a button"
// shape.
export function InviteSignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
    >
      Sign out and use a different account
    </Button>
  );
}
