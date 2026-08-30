"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// D-079 (P2-5): the plain native <select> here held ~400 IANA zone names
// with no search, forcing anyone not near the top of the alphabet to
// scroll through the whole list. This is a lightweight, dependency-free
// combobox (no @radix-ui/react-* package installed for this app yet) --
// a text input filters the option list, and a hidden input carries the
// actual selected IANA value so this still submits with the surrounding
// <form>'s plain FormData read, unchanged from the native <select> it
// replaces.
interface TimezoneComboboxProps {
  id: string;
  name: string;
  options: string[];
  defaultValue: string;
}

function displayLabel(tz: string): string {
  return tz.replace(/_/g, " ");
}

export function TimezoneCombobox({ id, name, options, defaultValue }: TimezoneComboboxProps) {
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState(displayLabel(defaultValue));
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // No saved value yet (new household, never hit in production today
  // since every household already has a timezone, but kept correct for
  // that case) -- default to the visitor's own detected zone instead of
  // a hardcoded fallback. Done post-mount only, so server and client
  // render the same initial markup and React doesn't flag a hydration
  // mismatch over a value that can only be known in the browser.
  useEffect(() => {
    if (defaultValue) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) {
      // One-time sync from a browser-only API (Intl) that isn't available
      // during SSR -- can't be a lazy useState initializer without baking
      // the server's timezone into the initial render and mismatching on
      // hydration, so this has to happen in an effect after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(detected);
      setQuery(displayLabel(detected));
    }
    // Only ever run once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Revert the visible search text to the last committed
        // selection if the user typed a search and clicked away
        // without picking a result from the list.
        setQuery(displayLabel(value));
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? options.filter((tz) => tz.toLowerCase().includes(q)) : options;
    return matches.slice(0, 50);
  }, [query, options]);

  function selectZone(tz: string) {
    setValue(tz);
    setQuery(displayLabel(tz));
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        autoComplete="off"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder="Search timezones…"
        className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
      />
      {open && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="bg-popover text-popover-foreground absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border shadow-md"
        >
          {filtered.length === 0 ? (
            <li className="text-muted-foreground px-3 py-2 text-sm">No matching timezones.</li>
          ) : (
            filtered.map((tz) => (
              <li key={tz} role="option" aria-selected={tz === value}>
                <button
                  type="button"
                  onClick={() => selectZone(tz)}
                  className={cn(
                    "hover:bg-accent hover:text-accent-foreground block w-full px-3 py-2 text-left text-sm",
                    tz === value && "bg-accent/50 font-medium"
                  )}
                >
                  {displayLabel(tz)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
