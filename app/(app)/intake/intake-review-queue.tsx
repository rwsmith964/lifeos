"use client";

// Module 3 (universal_intake_v2, D-136) review queue UI. Renders each
// intake_drafts row as a readable card (never a raw enum/JSON dump) and
// wires Approve/Reject to the server actions in actions.ts, which in turn
// call the already-tested lib/intake/review-queue.ts functions.
import { useState } from "react";
import { format } from "date-fns";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { approveIntakeDraftAction, rejectIntakeDraftAction } from "./actions";
import {
  RECORD_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  RECORD_TYPES_NEEDING_PERSON,
  FIELD_KEYS_HANDLED_ELSEWHERE,
  labelForField,
  formatFieldValue,
} from "@/lib/intake/labels";
import type { ExtractedField } from "@/lib/intake/confidence";
import type { IntakeDraftRow, PersonRow } from "@/lib/db/database.types";

const STATUS_LABELS: Record<IntakeDraftRow["status"], string> = {
  pending: "Processing",
  needs_review: "Needs your review",
  ready: "High confidence",
  converted: "Added",
  rejected: "Rejected",
};

function statusVariant(status: IntakeDraftRow["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "converted") return "default";
  if (status === "rejected") return "destructive";
  if (status === "ready") return "secondary";
  return "outline";
}

function isDateLikeKey(key: string): boolean {
  return /ISO$|Date$|On$/.test(key);
}

function formatFields(fields: Record<string, ExtractedField>): Array<{ key: string; label: string; text: string }> {
  return Object.entries(fields)
    .filter(([key]) => !FIELD_KEYS_HANDLED_ELSEWHERE.has(key))
    .map(([key, field]) => {
      let text = formatFieldValue(key, field.value);
      if (isDateLikeKey(key) && typeof field.value === "string" && field.value) {
        const parsed = new Date(field.value);
        if (!Number.isNaN(parsed.getTime())) {
          text = /T\d/.test(field.value) ? format(parsed, "MMM d, yyyy 'at' h:mm a") : format(parsed, "MMM d, yyyy");
        }
      }
      return { key, label: labelForField(key), text };
    });
}

function DraftCard({
  draft,
  people,
  readOnly,
}: {
  draft: IntakeDraftRow;
  people: PersonRow[];
  readOnly: boolean;
}) {
  const recordType = draft.detected_record_type;
  const needsPerson = recordType ? RECORD_TYPES_NEEDING_PERSON.includes(recordType) : false;
  const fields = (draft.extracted_fields ?? {}) as Record<string, ExtractedField>;
  const mentionedName = typeof fields.personNameMentioned?.value === "string" ? fields.personNameMentioned.value : null;

  const [resolvedPersonId, setResolvedPersonId] = useState<string>("");

  const approve = useAsyncToastAction(() => approveIntakeDraftAction(draft.id, resolvedPersonId || null), {
    successMessage: "Added.",
    errorMessage: "Couldn't add that",
  });
  const reject = useAsyncToastAction(() => rejectIntakeDraftAction(draft.id), {
    successMessage: "Rejected.",
  });

  const fieldRows = formatFields(fields);
  const canApprove = !needsPerson || resolvedPersonId !== "";

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{recordType ? RECORD_TYPE_LABELS[recordType] : "Unclassified"}</span>
          <span className="text-xs text-muted-foreground">via {SOURCE_TYPE_LABELS[draft.source_type]}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(draft.status)}>{STATUS_LABELS[draft.status]}</Badge>
          <span className="text-xs text-muted-foreground">{format(new Date(draft.created_at), "MMM d, h:mm a")}</span>
        </div>
      </div>

      {draft.source_excerpt && (
        <p className="rounded-sm bg-muted/50 p-2 text-xs italic text-muted-foreground">&ldquo;{draft.source_excerpt}&rdquo;</p>
      )}

      {fieldRows.length > 0 && (
        <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {fieldRows.map((row) => (
            <div key={row.key} className="flex gap-1">
              <dt className="text-muted-foreground">{row.label}:</dt>
              <dd>{row.text}</dd>
            </div>
          ))}
        </dl>
      )}

      {!readOnly && needsPerson && (draft.status === "needs_review" || draft.status === "ready" || draft.status === "pending") && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor={`person-${draft.id}`}>
            Who is this about?{mentionedName ? ` (mentioned as "${mentionedName}")` : ""}
          </label>
          <select
            id={`person-${draft.id}`}
            value={resolvedPersonId}
            onChange={(e) => setResolvedPersonId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-64"
          >
            <option value="">Choose a person…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname || p.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {draft.status === "converted" && <p className="text-sm text-muted-foreground">Added to {draft.converted_table?.replace(/_/g, " ")}.</p>}
      {draft.status === "rejected" && draft.review_note && <p className="text-sm text-muted-foreground">Note: {draft.review_note}</p>}

      {!readOnly && (draft.status === "needs_review" || draft.status === "ready" || draft.status === "pending") && (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={approve.pending || reject.pending || !canApprove}
            onClick={approve.run}
            title={!canApprove ? "Choose who this is about first" : undefined}
          >
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={approve.pending || reject.pending} onClick={reject.run}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export function IntakeReviewQueue({
  drafts,
  people,
  readOnly = false,
}: {
  drafts: IntakeDraftRow[];
  people: PersonRow[];
  readOnly?: boolean;
}) {
  if (drafts.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here right now.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} people={people} readOnly={readOnly} />
      ))}
    </div>
  );
}
