"use client";

import { format } from "date-fns";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { reviewExecutionDraftAction } from "./actions";
import { CATEGORY_LABELS } from "@/lib/execution/labels";
import type { ExecutionDraftRow, ExecutionDraftStatus, PersonRow } from "@/lib/db/database.types";

const STATUS_LABELS: Record<ExecutionDraftStatus, string> = {
  pending_review: "Waiting for review",
  approved: "Approved",
  discarded: "Discarded",
};

function statusVariant(status: ExecutionDraftStatus): "default" | "secondary" | "destructive" {
  if (status === "approved") return "default";
  if (status === "discarded") return "destructive";
  return "secondary";
}

function DraftCard({ draft, contactName, readOnly }: { draft: ExecutionDraftRow; contactName: string | null; readOnly: boolean }) {
  const approve = useAsyncToastAction(() => reviewExecutionDraftAction(draft.id, "approved"), {
    successMessage: "Marked approved — remember to send it yourself, the assistant doesn't send anything.",
  });
  const discard = useAsyncToastAction(() => reviewExecutionDraftAction(draft.id, "discarded"), {
    successMessage: "Draft discarded.",
  });

  const timestamp = draft.reviewed_at ?? draft.created_at;

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{CATEGORY_LABELS[draft.category]}</span>
          {contactName && <span className="text-sm text-muted-foreground">to {contactName}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(draft.status)}>{STATUS_LABELS[draft.status]}</Badge>
          <span className="text-xs text-muted-foreground">{format(new Date(timestamp), "MMM d, h:mm a")}</span>
        </div>
      </div>
      {draft.draft_subject && <p className="text-sm font-medium">{draft.draft_subject}</p>}
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.draft_body}</p>
      {!readOnly && draft.status === "pending_review" && (
        <div className="flex gap-2">
          <Button size="sm" disabled={approve.pending || discard.pending} onClick={approve.run}>
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={approve.pending || discard.pending} onClick={discard.run}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}

export function DraftReviewQueue({
  drafts,
  people,
  readOnly = false,
}: {
  drafts: ExecutionDraftRow[];
  people: PersonRow[];
  readOnly?: boolean;
}) {
  if (drafts.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here right now.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {drafts.map((draft) => (
        <DraftCard
          key={draft.id}
          draft={draft}
          contactName={people.find((p) => p.id === draft.contact_person_id)?.full_name ?? null}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
