"use client";

import { useEffect } from "react";
import { LAYERS_COOKIE } from "@/lib/calendar/layers";

/** Remembers the chosen calendar layers so the next visit starts the same way. */
export function LayersPersist({ value }: { value: string }) {
  useEffect(() => {
    try {
      document.cookie = `${LAYERS_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: the URL still carries the choice.
    }
  }, [value]);
  return null;
}
