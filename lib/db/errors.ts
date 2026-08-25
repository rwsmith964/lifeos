// The pattern behind three separate full-app crashes (React error #441)
// across two remediation passes: every Server Action validated its input
// with Zod, then called a repository method and let whatever Postgres
// threw — a unique-constraint violation, an RLS denial, a network error —
// propagate straight out uncaught. With no error.tsx anywhere in the tree,
// an uncaught Server Action error takes down the whole page. See
// DECISIONS.md D-032. This is the shared fix: every mutating action wraps
// its write in try/catch and maps the result through here instead of
// either leaking the raw Postgres/Zod message to the user or crashing.
//
// error.tsx boundaries (app/(app)/error.tsx, app/global-error.tsx) are the
// second half of the fix — they exist so that anything that still slips
// past this (a bug in a route this pass didn't touch, a genuinely
// unexpected failure) degrades to a friendly retry screen instead of a
// blank page, per the brief's "no user action may ever blank the app."

// https://www.postgresql.org/docs/current/errcodes-appendix.html
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_CHECK_VIOLATION = "23514";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_RLS_VIOLATION = "42501";

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
}

function isPostgrestLikeError(error: unknown): error is PostgrestLikeError {
  return typeof error === "object" && error !== null && "code" in error;
}

export interface MutationErrorMessages {
  /** Shown when a unique-constraint conflict occurs (code 23505). */
  uniqueViolation?: string;
  /** Shown when a check-constraint fails (code 23514) — validation Zod didn't catch. */
  checkViolation?: string;
  /** Shown for anything else, including non-Postgres errors (network, etc). */
  fallback?: string;
}

const DEFAULT_FALLBACK = "Something went wrong saving that — please try again.";

/**
 * Turn a caught mutation error into a message safe to show a user. Always
 * logs the real error server-side first — the caller loses nothing by
 * routing every catch block through this instead of writing its own.
 */
export function friendlyMutationError(error: unknown, messages: MutationErrorMessages = {}): string {
  console.error("Mutation failed:", error);

  if (isPostgrestLikeError(error)) {
    if (error.code === PG_UNIQUE_VIOLATION && messages.uniqueViolation) return messages.uniqueViolation;
    if (error.code === PG_CHECK_VIOLATION && messages.checkViolation) return messages.checkViolation;
  }
  return messages.fallback ?? DEFAULT_FALLBACK;
}
