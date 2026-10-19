"use client";

import { useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";

// C1 (audit pass 2026-09-11): "Five screens, 51 fields, 16 sections, one
// heading... Split into tabs: Overview (contact, cadence, notes, next
// occasion) · Schedule (work, time off) · Gifts (budgets, sites, ideas,
// history, wishlist) · History (conversation log, moments, reciprocity)."
// Every section below is still fetched and rendered server-side in
// page.tsx exactly as before -- this client component only decides which
// pre-rendered tab's content is visible, via CSS (all four stay mounted,
// so a form's local state or scroll position inside a tab isn't lost by
// switching away and back).
type Tab = "overview" | "schedule" | "gifts" | "history";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "schedule", label: "Schedule" },
  { value: "gifts", label: "Gifts" },
  { value: "history", label: "History" },
];

export function PersonPageTabs({
  overview,
  schedule,
  gifts,
  history,
}: {
  overview: ReactNode;
  schedule: ReactNode;
  gifts: ReactNode;
  history: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl options={TABS} value={tab} onChange={setTab} aria-label="Person page section" />
      <div className={tab === "overview" ? "flex flex-col gap-4" : "hidden"}>{overview}</div>
      <div className={tab === "schedule" ? "flex flex-col gap-4" : "hidden"}>{schedule}</div>
      <div className={tab === "gifts" ? "flex flex-col gap-4" : "hidden"}>{gifts}</div>
      <div className={tab === "history" ? "flex flex-col gap-4" : "hidden"}>{history}</div>
    </div>
  );
}
