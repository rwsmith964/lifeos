"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Wires the app's existing `.dark` class + oklch CSS variables (already
 * defined in app/globals.css for every component) to next-themes, which
 * handles: toggling the class on <html>, persisting the choice to
 * localStorage, following the OS `prefers-color-scheme` when the user
 * picks "System", and injecting a pre-hydration inline script so there's
 * no light-mode flash before React mounts on a dark-preferring device.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
