"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

function isThemeValue(value: string | undefined): value is ThemeValue {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Three-way Light / Dark / System control, built on the shared
 * SegmentedControl primitive (Redesign Part 3) instead of its own bespoke
 * markup. Renders a theme-neutral placeholder until mounted — next-themes
 * only knows the real resolved theme after hydration (it reads
 * localStorage / the OS preference client-side), so rendering the live
 * selection any earlier would mismatch between server and client and could
 * flash the wrong option briefly.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Standard next-themes hydration-safe mount detection: the real theme
  // is only knowable client-side (localStorage/OS preference), so this
  // one-time flip after mount is intentional, not a sync bug.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <SegmentedControl
      aria-label="Color theme"
      options={[...OPTIONS]}
      value={mounted && isThemeValue(theme) ? theme : "system"}
      onChange={(value) => setTheme(value)}
    />
  );
}
