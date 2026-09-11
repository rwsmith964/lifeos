"use client";

import { useTransition } from "react";
import Link from "next/link";
import { updateOpportunityStatusAction } from "../opportunities/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PresentedOpportunity } from "@/lib/opportunities/present";

// Redesign (Part 2 — Plan): "a list of scored proposals ... A proposal
// shows its score as a serif numeral, the title, attribute chips
// (indoors/covered, drive time, duration, relationship reason), and
// Add/Swap buttons." Built on the pre-existing opportunity-detection
// engine (D-061/D-070) -- score/headline/reasoning are all real,
// already-computed data, not new scoring built for this page.
//
// "Add"/"Swap" reuse the existing opportunity status transitions
// (acted_on/dismissed) rather than new ones: acted_on already writes
// last_done_at (the real "we did this" signal future scoring reads), which
// is the closest existing match to "commit to this for the weekend."
// Dismissed removes it from the list, which is what "Swap" needs -- the
// next-best candidate (if any) is whatever the opportunity engine's own
// ranking already promotes once this one is gone.
export function PlanProposalCard({ opportunity, dayLabel }: { opportunity: PresentedOpportunity; dayLabel: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-[18px] rounded-card border border-line bg-surface px-[22px] py-5">
      <span className="shrink-0 font-serif text-[34px] leading-none text-action">{opportunity.score}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
        <p className="font-sans text-card-headline text-ink">{opportunity.headline}</p>
        <p className="font-sans text-body text-ink-2">{opportunity.reasoning}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{opportunity.tier}</Badge>
          {(opportunity.activity_id || opportunity.trip_idea_id) && (
            <Link
              href={opportunity.activity_id ? `/activities/${opportunity.activity_id}/edit` : `/activities/trips/${opportunity.trip_idea_id}/edit`}
              className="font-sans text-metadata text-meta underline underline-offset-2 hover:text-ink"
            >
              View details
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => startTransition(() => updateOpportunityStatusAction(opportunity.id, "acted_on"))}
          >
            Add to {dayLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => startTransition(() => updateOpportunityStatusAction(opportunity.id, "dismissed"))}
          >
            Swap
          </Button>
        </div>
      </div>
    </div>
  );
}
