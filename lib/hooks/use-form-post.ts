"use client";

// Shared client-side submit helper for the create forms that had to move
// off native Server Actions — see DECISIONS.md D-031: Server Actions
// nested under app/(app)'s auth-redirecting layout reliably fail in
// production on this Next.js version, landing back on /login with no
// error surfaced and no server code ever running. Route Handlers (plain
// POST endpoints) don't share that failure mode, so these forms submit via
// fetch() instead. Using FormData end to end means the field markup itself
// doesn't need to change, only how the form is submitted, and since there's
// no page navigation on failure, entered values are never lost — the form
// simply stays as the user left it.
import { useState } from "react";
import { useRouter } from "next/navigation";

interface UseFormPostOptions {
  onSuccess?: (data: Record<string, unknown>) => void;
  redirectTo?: (data: Record<string, unknown>) => string;
}

export function useFormPost(endpoint: string) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Optional field name the server-side validator pinned the error to
  // (e.g. "enjoymentRank") — forms with more than one plausibly-invalid
  // field use this to place the message under the right input and clear
  // it as soon as that field changes, instead of one generic message
  // near the submit button (KNOWN-ISSUES.md 1.3). Forms with only one
  // meaningfully-validated field, or that already disambiguate by
  // matching on `error`'s text, can ignore this.
  const [errorField, setErrorField] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData, opts: UseFormPostOptions = {}) {
    setPending(true);
    setError(null);
    setErrorField(null);
    let data: Record<string, unknown> = {};
    try {
      const res = await fetch(endpoint, { method: "POST", body: formData });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
        setErrorField(typeof data.field === "string" ? data.field : null);
        setPending(false);
        return;
      }
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setPending(false);
      return;
    }

    opts.onSuccess?.(data);
    if (opts.redirectTo) router.push(opts.redirectTo(data));
    else setPending(false);
  }

  function clearErrorField(field: string) {
    setErrorField((current) => (current === field ? null : current));
  }

  return { submit, pending, error, errorField, clearErrorField };
}
