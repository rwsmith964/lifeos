"use client";

// Checked once per mount by every AI-backed control (gift ideas, weekend
// plan, Quick Capture) so they can render disabled-with-a-reason instead
// of letting the user submit into a guaranteed failure — see
// DECISIONS.md D-032 and app/api/health/route.ts.
import { useEffect, useState } from "react";

export function useAiHealth(): { aiAvailable: boolean | null } {
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAiAvailable(Boolean(data.ai));
      })
      .catch(() => {
        if (!cancelled) setAiAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { aiAvailable };
}
