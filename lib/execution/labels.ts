// Module 6 (execution_draft_only, D-122) display labels. Kept out of
// app/(app)/execution/page.tsx (a Next.js page file) so client components
// can import these without pulling in a server-only page module — and so
// the ground rule "don't show raw enum values ... to the user anywhere"
// has exactly one place to check for this module's category enum.
import type { ExecutionCategory } from "../db/database.types";

export const EXECUTION_CATEGORIES: ExecutionCategory[] = ["rsvp", "reschedule", "confirmation", "gift_order"];

export const CATEGORY_LABELS: Record<ExecutionCategory, string> = {
  rsvp: "RSVPs",
  reschedule: "Reschedules",
  confirmation: "Confirmations",
  gift_order: "Gift orders",
};

/**
 * Deterministic, non-AI starter text per category — v1 deliberately does
 * not call any AI text-generation for draft bodies (see QUEUE-023); a
 * household member always edits before approving. Lives here (not in
 * generate-draft.ts, which pulls in repository/Supabase-client code)
 * specifically so client components — the "Use a starter template"
 * button — can import it without bundling server-side data-access code.
 */
export function templateForCategory(category: ExecutionCategory, contactName: string | null): string {
  const who = contactName ?? "there";
  switch (category) {
    case "rsvp":
      return `Hi ${who}, thanks for the invite — we'll be there! Let us know if you need anything from us ahead of time.`;
    case "reschedule":
      return `Hi ${who}, something's come up and we need to move our plans. Do any of these alternate times work for you?`;
    case "confirmation":
      return `Hi ${who}, just confirming we're still on for our plans. Looking forward to it!`;
    case "gift_order":
      return `Confirming the order details before we place this — please double-check the size/color/quantity and shipping address.`;
  }
}
