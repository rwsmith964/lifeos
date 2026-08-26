"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/**
 * Shared two-click "arm, then confirm" delete flow (KNOWN-ISSUES.md 1.5: no
 * confirm/undo on any delete). First click arms the action and flips the
 * button into its "Confirm delete" state; a second click within the arm
 * window actually runs it. Arming auto-resets after `armMs` so a stray
 * second click days later can't slip through as a confirm.
 *
 * `action` should reject/throw on failure (server actions here already
 * return `{ error }` shapes via `friendlyMutationError` — pass a wrapper
 * that throws `new Error(result.error)` when present, or a raw action that
 * throws directly; both are handled the same way here).
 */
function isNextNavigationSignal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (error as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))
  );
}

export function useConfirmDelete(action: () => Promise<void> | void, armMs = 4000) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const trigger = useCallback(() => {
    setError(null);
    if (!armed) {
      setArmed(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setArmed(false), armMs);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    startTransition(async () => {
      try {
        await action();
        setArmed(false);
      } catch (err) {
        // Next.js redirect()/notFound() inside a server action surface here
        // as a special digest-tagged error ("NEXT_REDIRECT"/"NEXT_NOT_FOUND")
        // rather than a real failure — some actions this hook wraps (e.g.
        // archivePersonAction) redirect on success. Rethrow so Next's own
        // client runtime still performs the navigation instead of us
        // swallowing it and showing a bogus error message.
        if (isNextNavigationSignal(err)) throw err;
        setArmed(false);
        setError(err instanceof Error ? err.message : "Couldn't delete that — please try again.");
      }
    });
  }, [armed, action, armMs]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setArmed(false);
    setError(null);
  }, []);

  return { armed, pending, error, trigger, cancel };
}
