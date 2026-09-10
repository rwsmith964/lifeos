"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CapturePanel } from "./capture-panel";

// Redesign (Part 2): Quick Capture's trigger moves from a single floating
// corner button to two places -- a persistent header command bar
// (desktop/tablet) and a circular button in the bottom tab bar (phone) --
// plus a global ⌘K/Ctrl+K shortcut "from anywhere." The actual capture
// panel/logic (components/capture/capture-panel.tsx, lifted unchanged from
// the old capture-button.tsx) is mounted once here so every trigger opens
// the exact same instance, and the keyboard shortcut has something to
// open regardless of which page or trigger component is on screen.
interface CaptureContextValue {
  open: boolean;
  openCapture: () => void;
  closeCapture: () => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function useCapture(): CaptureContextValue {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture must be used within a CaptureProvider");
  return ctx;
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <CaptureContext.Provider value={{ open, openCapture: () => setOpen(true), closeCapture: () => setOpen(false) }}>
      {children}
      <CapturePanel open={open} onClose={() => setOpen(false)} />
    </CaptureContext.Provider>
  );
}
