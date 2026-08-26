"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Three-way Light / Dark / System segmented control. Renders a
 * theme-neutral placeholder until mounted — next-themes only knows the
 * real resolved theme after hydration (it reads localStorage / the OS
 * preference client-side), so rendering the live selection any earlier
 * would mismatch between server and client and could flash the wrong
 * option briefly.
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
    <div
      className="inline-flex rounded-md border p-1"
      role="radiogroup"
      aria-label="Color theme"
    >
      {OPTIONS.map((option) => {
        const isActive = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <option.icon className="size-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
