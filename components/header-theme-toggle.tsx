"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

// G5 (audit pass 2026-09-11): "The palette picker and light/dark/system
// toggle are a genuinely nice detail sitting on a page nobody can find...
// also add a theme toggle to the top bar." A2 already fixed the "can't
// find it" half (Settings is now a real, labeled sidebar/header
// destination) -- this adds the quick-access header control on top, a
// compact single icon button (not the full three-way SegmentedControl
// components/theme-toggle.tsx uses on the Settings page itself, which
// would be too wide for the header) that cycles light -> dark -> system
// on each click and always shows the current choice's icon.
const CYCLE = ["light", "dark", "system"] as const;
type ThemeValue = (typeof CYCLE)[number];

function isThemeValue(value: string | undefined): value is ThemeValue {
  return value === "light" || value === "dark" || value === "system";
}

const ICONS: Record<ThemeValue, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const LABELS: Record<ThemeValue, string> = { light: "Light", dark: "Dark", system: "System" };

export function HeaderThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Hydration-safe mount detection, same reasoning as components/theme-toggle.tsx.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const current: ThemeValue = mounted && isThemeValue(theme) ? theme : "system";
  const Icon = ICONS[current];

  return (
    <button
      type="button"
      onClick={() => setTheme(CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length])}
      aria-label={`Theme: ${LABELS[current]}. Click to change.`}
      title={`Theme: ${LABELS[current]}`}
      className="relative inline-flex size-control-default items-center justify-center rounded-control border border-line text-ink-2 motion-safe-transition hover:border-line-strong hover:text-ink"
    >
      <Icon className="size-5" />
    </button>
  );
}
