"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Redesign (docs/redesign-brief.md Part 4): three switchable colour
// palettes, orthogonal to next-themes' own light/dark axis. next-themes
// manages one attribute (`class`) well; rather than fight it into managing
// a second, unrelated concern, this is a small sibling provider using the
// exact same no-flash technique next-themes itself uses (a synchronous,
// render-blocking inline script that reads localStorage and sets the DOM
// attribute before first paint).
export const PALETTES = ["warm-evening-desk", "sunrise-citrus", "harbor-bright"] as const;
export type Palette = (typeof PALETTES)[number];

export const PALETTE_LABELS: Record<Palette, string> = {
  "warm-evening-desk": "Warm evening desk",
  "sunrise-citrus": "Sunrise citrus",
  "harbor-bright": "Harbor bright",
};

const STORAGE_KEY = "lifeos-palette";

interface PaletteContextValue {
  palette: Palette;
  setPalette: (palette: Palette) => void;
}

const PaletteContext = createContext<PaletteContextValue | null>(null);

export function usePalette(): PaletteContextValue {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette must be used within a PaletteProvider");
  return ctx;
}

function isPalette(value: string | null): value is Palette {
  return !!value && (PALETTES as readonly string[]).includes(value);
}

function paletteInitScript(defaultPalette: Palette): string {
  // Deliberately minified/inline: this runs synchronously in <head>/<body>
  // parse order, before React hydrates, so it must have zero dependencies
  // and do the least possible work.
  return `(function(){try{var p=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var v=${JSON.stringify(
    PALETTES
  )};if(!p||v.indexOf(p)===-1)p=${JSON.stringify(defaultPalette)};document.documentElement.setAttribute("data-palette",p);}catch(e){document.documentElement.setAttribute("data-palette",${JSON.stringify(
    defaultPalette
  )});}})();`;
}

export function PaletteProvider({
  children,
  defaultPalette,
}: {
  children: ReactNode;
  defaultPalette: Palette;
}) {
  const [palette, setPaletteState] = useState<Palette>(defaultPalette);

  // Standard next-themes-style hydration-safe sync (same pattern as
  // components/theme-toggle.tsx): the real palette is only knowable
  // client-side (whatever the pre-hydration script above actually set,
  // which may differ from defaultPalette if localStorage had a stored
  // choice), so this one-time flip after mount is intentional.
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-palette");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isPalette(current)) setPaletteState(current);
  }, []);

  function setPalette(next: Palette) {
    setPaletteState(next);
    document.documentElement.setAttribute("data-palette", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode, disabled storage) -- the choice
      // just won't persist across reloads; not worth surfacing an error for.
    }
  }

  return (
    <PaletteContext.Provider value={{ palette, setPalette }}>
      {/* Render-blocking by design -- see paletteInitScript's doc comment. */}
      <script dangerouslySetInnerHTML={{ __html: paletteInitScript(defaultPalette) }} />
      {children}
    </PaletteContext.Provider>
  );
}
