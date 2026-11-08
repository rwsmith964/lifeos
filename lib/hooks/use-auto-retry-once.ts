"use client";

import { useEffect, useState } from "react";

function hasAlreadyTried(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) === "1") return true;
    sessionStorage.setItem(key, "1");
    return false;
  } catch {
    // Storage unavailable (private mode) -- skip the retry and just show
    // the error immediately rather than risk retrying forever.
    return true;
  }
}

/**
 * B-02: "Add a retry (once, with backoff) on RSC/navigation failures before
 * surfacing an error." A lot of what read as a hard crash in the audit was
 * a transient server error (a 503, a dropped connection) that a same-session
 * retry clears on its own -- surfacing the error screen immediately on the
 * first failure is needlessly alarming when a quiet retry would just work.
 *
 * The "have we already tried this exact error" check runs once, synchronously,
 * as a lazy useState initializer (a render-time read, not a side effect) so
 * there's no setState-during-effect involved; the timed `retry()` call is the
 * only thing that happens in an effect, which is exactly the "update an
 * external system" case effects are for. Tracked in sessionStorage keyed by
 * the error's digest (or message, if no digest) so a second failure of the
 * *same* error shows the UI immediately rather than looping.
 *
 * Returns `true` once it's safe to render the real error UI (either the
 * retry has already been attempted once, or storage wasn't available).
 */
export function useAutoRetryOnce(error: Error & { digest?: string }, retry: () => void, delayMs = 700): boolean {
  const [alreadyTried] = useState(() => hasAlreadyTried(`lifeos-error-retry:${error.digest ?? error.message ?? "unknown"}`));

  useEffect(() => {
    if (alreadyTried) return;
    const timer = setTimeout(retry, delayMs);
    return () => clearTimeout(timer);
  }, [alreadyTried, delayMs, retry]);

  return alreadyTried;
}
