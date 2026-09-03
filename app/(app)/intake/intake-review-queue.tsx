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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { approveIntakeDraftAction, correctIntakeDraftAction, rejectIntakeDraftAction } from "./actions";
import {
  RECORD_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  RECORD_TYPES_NEEDING_PERSON,
  FIELD_KEYS_HANDLED_ELSEWHERE,
  CORRECTABLE_RECORD_TYPES,
  labelForField,
  formatFieldValue,
  inputSpecForField,
  type FieldInputKind,
  type FieldInputSpec,
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

// QUEUE-039: converts one extracted field's stored value into the string
// (or boolean, for a checkbox) an <input>/<select>/<textarea> can hold,
// based on its FieldInputKind -- the inverse of editValueToCorrection
// below. datetime fields go through a local-time round trip (an ISO
// string is UTC; datetime-local inputs work in the browser's local time)
// the same way every other date-carrying form in this app treats a
// datetime-local value as already-local, not UTC.
function fieldValueToEditValue(kind: FieldInputKind, value: unknown): string | boolean {
  if (kind === "boolean") return value === true;
  if (kind === "datetime") {
    if (typeof value !== "string" || !value) return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd'T'HH:mm");
  }
  if (kind === "number") return typeof value === "number" ? String(value) : "";
  return typeof value === "string" ? value : "";
}

/** Inverse of fieldValueToEditValue -- turns one form value back into the
 * shape lib/intake/convert.ts and correctDraftFields expect to store. The
 * caller decides which fields to submit (only ones that actually changed,
 * compared against the edit-state snapshot taken when editing began). */
function editValueToCorrection(kind: FieldInputKind, value: string | boolean): unknown {
  if (kind === "boolean") return value === true;
  if (typeof value !== "string") return null;
  if (value === "") return null;
  if (kind === "number") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (kind === "datetime") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return value;
}

// QUEUE-039: one input for one editable extracted field, shape chosen by
// inputSpecForField(key) -- a checkbox for a boolean, a native select for a
// constrained enum (options rendered the same lowercase-with-underscore way
// every other select in this app already does), otherwise a text/number/
// date/datetime input. Kept as its own component so DraftCard's edit-mode
// JSX stays a plain list of these instead of a repeated switch inline.
function FieldInput({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: FieldInputSpec;
  value: string | boolean;
  onChange: (next: string | boolean) => void;
}) {
  if (spec.kind === "boolean") {
    return <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />;
  }
  const stringValue = typeof value === "string" ? value : "";
  if (spec.kind === "select") {
    return (
      <select
        id={id}
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">—</option>
        {spec.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    );
  }
  if (spec.kind === "textarea") {
    return <Textarea id={id} value={stringValue} onChange={(e) => onChange(e.target.value)} rows={3} />;
  }
  const inputType = spec.kind === "number" ? "number" : spec.kind === "date" ? "date" : spec.kind === "datetime" ? "datetime-local" : "text";
  return (
    <Input
      id={id}
      type={inputType}
      step={spec.kind === "number" ? "any" : undefined}
      value={stringValue}
      onChange={(e) => onChange(e.target.value)}
    />
  );
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

  const editableEntries = Object.entries(fields).filter(([key]) => !FIELD_KEYS_HANDLED_ELSEWHERE.has(key));

  // QUEUE-039: edit mode holds its own draft state so nothing is written
  // until Save is clicked -- Cancel just discards editValues/editRecordType
  // and drops back to the read-only field list, same as any other
  // "correct then save" pattern elsewhere in this app.
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string | boolean>>({});
  const [editRecordType, setEditRecordType] = useState<IntakeDraftRow["detected_record_type"]>(recordType);

  function startEditing() {
    const initial: Record<string, string | boolean> = {};
    for (const [key, field] of editableEntries) {
      initial[key] = fieldValueToEditValue(inputSpecForField(key).kind, field.value);
    }
    setEditValues(initial);
    setEditRecordType(recordType);
    setIsEditing(true);
  }

  const correct = useAsyncToastAction(
    async () => {
      const corrections: Record<string, unknown> = {};
      for (const [key, field] of editableEntries) {
        const spec = inputSpecForField(key);
        const nextRaw = editValues[key];
        const nextStored = editValueToCorrection(spec.kind, nextRaw ?? "");
        if (nextStored !== field.value) corrections[key] = nextStored;
      }
      const recordTypeChanged = editRecordType && editRecordType !== recordType ? editRecordType : undefined;
      if (Object.keys(corrections).length === 0 && !recordTypeChanged) {
        setIsEditing(false);
        return;
      }
      await correctIntakeDraftAction(draft.id, corrections, recordTypeChanged);
      setIsEditing(false);
    },
    {
      successMessage: "Corrections saved.",
      errorMessage: "Couldn't save those corrections",
    }
  );

  const approve = useAsyncToastAction(() => approveIntakeDraftAction(draft.id, resolvedPersonId || null), {
    successMessage: "Added.",
    errorMessage: "Couldn't add that",
  });
  const reject = useAsyncToastAction(() => rejectIntakeDraftAction(draft.id), {
    successMessage: "Rejected.",
  });

  const fieldRows = formatFields(fields);
  const canApprove = !needsPerson || resolvedPersonId !== "";
  const isActionable = draft.status === "needs_review" || draft.status === "ready" || draft.status === "pending";

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

      {isEditing ? (
        <div className="flex flex-col gap-3 rounded-sm border bg-muted/30 p-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor={`record-type-${draft.id}`}>
              Record type
            </label>
            <select
              id={`record-type-${draft.id}`}
              value={editRecordType ?? ""}
              onChange={(e) => setEditRecordType((e.target.value || null) as IntakeDraftRow["detected_record_type"])}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-64"
            >
              <option value="">Unclassified</option>
              {CORRECTABLE_RECORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RECORD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {editableEntries.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {editableEntries.map(([key]) => {
                const spec = inputSpecForField(key);
                const inputId = `field-${draft.id}-${key}`;
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground" htmlFor={inputId}>
                      {labelForField(key)}
                    </label>
                    <FieldInput
                      id={inputId}
                      spec={spec}
                      value={editValues[key] ?? ""}
                      onChange={(next) => setEditValues((prev) => ({ ...prev, [key]: next }))}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={correct.pending} onClick={correct.run}>
              Save corrections
            </Button>
            <Button size="sm" variant="outline" disabled={correct.pending} onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        fieldRows.length > 0 && (
          <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {fieldRows.map((row) => (
              <div key={row.key} className="flex gap-1">
                <dt className="text-muted-foreground">{row.label}:</dt>
                <dd>{row.text}</dd>
              </div>
            ))}
          </dl>
        )
      )}

      {!readOnly && !isEditing && needsPerson && isActionable && (
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

      {!readOnly && !isEditing && isActionable && (
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
          <Button size="sm" variant="outline" disabled={approve.pending || reject.pending} onClick={startEditing}>
            Correct
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
