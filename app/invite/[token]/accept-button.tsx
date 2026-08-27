"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteAction } from "./actions";
import { Button } from "@/components/ui/button";

// Not routed through useConfirmDelete (KNOWN-ISSUES.md's two-click delete
// pattern) — accepting an invite isn't a destructive action needing a
// confirm step, just a plain async button. Mirrors the digest-rethrow
// handling from use-confirm-delete.ts since acceptInviteAction redirects
// on success, which Next surfaces as a special NEXT_REDIRECT-tagged thrown
// error rather than a normal return value.
function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await acceptInviteAction(token);
        if (result.error) setError(result.error);
      } catch (err) {
        if (isNextRedirect(err)) throw err;
        setError(err instanceof Error ? err.message : "Couldn't accept that invite.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={handleClick} disabled={pending}>
        {pending ? "Joining…" : "Accept invite"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        className="text-xs text-muted-foreground underline underline-offset-2"
        onClick={() => router.push("/")}
      >
        Not now
      </button>
    </div>
  );
}
