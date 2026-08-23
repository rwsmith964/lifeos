"use client";

import { useTransition } from "react";
import { signOut } from "../actions";
import { Button } from "@/components/ui/button";

// Calling the "use server" function directly on click, not via a
// <form action={signOut}> binding — see DECISIONS.md D-031.
export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
    >
      Sign out
    </Button>
  );
}
