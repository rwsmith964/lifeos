"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

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
        // D-051: the Server Action's own revalidatePath() call correctly
        // marks the route stale and (per direct network inspection) the
        // POST response IS the fresh, already-updated RSC payload — but
        // in production this tab's already-mounted component tree was
        // observed staying stuck on the pre-delete view for 5+ seconds
        // with zero errors, only fixing itself on the next real
        // navigation/reload. router.refresh() forces this tab to
        // re-request and apply a fresh server render explicitly, instead
        // of relying on the framework to notice and apply the
        // revalidation signal on its own. Cheap (one extra round trip)
        // and used by every delete flow sharing this hook (activities,
        // gifts, interests, budgets, calendar events/custody, people).
        router.refresh();
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
  }, [armed, action, armMs, router]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setArmed(false);
    setError(null);
  }, []);

  return { armed, pending, error, trigger, cancel };
}
