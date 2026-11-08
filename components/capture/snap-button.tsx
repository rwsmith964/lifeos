"use client";

// The always-visible camera button. One tap opens the phone's camera or photo
// library (the file picker offers both), the AI reads the picture and decides
// where it belongs, and the person confirms before anything is added.
//   - An invitation continues in the "Add from a photo" flow, with the
//     reading already done.
//   - Anything else (a flyer, a recipe, a flight confirmation, a gift idea, a
//     note about someone) is confirmed right here in the sheet.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downscaleToJpeg } from "@/lib/client/image";
import { matchNamesToPeople, type MatchablePerson } from "@/lib/invites/match-names";
import { RECORD_TYPE_LABELS, RECORD_TYPES_NEEDING_PERSON, formatFieldValue, type IntakeRecordType } from "@/lib/intake/labels";
import { approveSnapDraftAction, discardSnapDraftAction } from "@/app/(app)/snap-actions";

export const SNAP_INVITE_STORAGE_KEY = "lifeos:snap-invite";

interface SnapDraft {
  id: string;
  recordType: IntakeRecordType | null;
  convertible: boolean;
  excerpt: string | null;
  mentionedName: string | null;
  fields: Array<{ key: string; label: string; value: string | number | boolean | null }>;
}

type Stage =
  | { name: "idle" }
  | { name: "reading" }
  | { name: "error"; message: string }
  | { name: "draft"; draft: SnapDraft; people: MatchablePerson[] }
  | { name: "done"; message: string };

function displayValue(key: string, value: SnapDraft["fields"][number]["value"]): string {
  if (typeof value === "string" && value && /ISO$|Date$|On$/.test(key)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return /T\d/.test(value) ? format(parsed, "MMM d, yyyy 'at' h:mm a") : format(parsed, "MMM d, yyyy");
    }
  }
  return formatFieldValue(key, value);
}

export function SnapButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [personId, setPersonId] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStage({ name: "reading" });
    setActionError(null);
    let base64: string;
    try {
      base64 = await downscaleToJpeg(file);
    } catch {
      setStage({ name: "error", message: "Couldn't open that photo. Try a JPEG or PNG, or take a new picture." });
      return;
    }
    try {
      const res = await fetch("/api/snap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data: base64, mediaType: "image/jpeg" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === "invite") {
        try {
          sessionStorage.setItem(SNAP_INVITE_STORAGE_KEY, JSON.stringify(data.invite));
        } catch {
          // Storage blocked: the invite page will simply ask for the photo again.
        }
        setStage({ name: "idle" });
        router.push("/calendar/invite");
        return;
      }
      if (data.status === "draft") {
        const people = data.people as MatchablePerson[];
        const draft = data.draft as SnapDraft;
        const match = draft.mentionedName ? matchNamesToPeople([draft.mentionedName], people)[0] : null;
        setPersonId(match?.status === "confident" ? match.candidates[0].personId : "");
        setStage({ name: "draft", draft, people });
        return;
      }
      setStage({ name: "error", message: data.message ?? "Couldn't read that photo — try again." });
    } catch {
      setStage({ name: "error", message: "Couldn't reach the server — check your connection and try again." });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function close() {
    setStage({ name: "idle" });
    setActionError(null);
  }

  async function add(draft: SnapDraft) {
    setSaving(true);
    setActionError(null);
    const res = await approveSnapDraftAction(draft.id, personId || null);
    setSaving(false);
    if (res.error) return setActionError(res.error);
    router.refresh();
    setStage({ name: "done", message: res.message ? `Done — ${res.message}.` : "Added." });
  }

  async function discard(draft: SnapDraft) {
    setSaving(true);
    const res = await discardSnapDraftAction(draft.id);
    setSaving(false);
    if (res.error) return setActionError(res.error);
    close();
  }

  const open = stage.name !== "idle";

  return (
    <>
      <button
        type="button"
        aria-label="Snap a photo or upload one"
        title="Snap a photo or upload one"
        onClick={() => inputRef.current?.click()}
        disabled={stage.name === "reading"}
        className="fixed bottom-24 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-action text-on-action shadow-lg motion-safe-transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-action/50 disabled:opacity-70 md:bottom-6 md:right-6"
      >
        {stage.name === "reading" ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {open && stage.name !== "reading" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4" role="presentation" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Photo"
            className="flex max-h-[85vh] w-full max-w-[520px] flex-col gap-3 overflow-y-auto rounded-t-sheet border border-line bg-surface p-[18px] sm:rounded-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-sans text-body font-bold text-ink">
                {stage.name === "draft"
                  ? stage.draft.recordType
                    ? `Looks like: ${RECORD_TYPE_LABELS[stage.draft.recordType]}`
                    : "What I found"
                  : stage.name === "done"
                    ? "All set"
                    : "Couldn't read that"}
              </p>
              <button type="button" aria-label="Close" onClick={close} className="text-ink-2 hover:text-ink">
                <X className="size-5" />
              </button>
            </div>

            {stage.name === "error" && (
              <>
                <p className="font-sans text-body text-ink-2">{stage.message}</p>
                <div className="flex gap-2">
                  <Button onClick={() => inputRef.current?.click()}>Try another photo</Button>
                  <Button variant="outline" onClick={close}>
                    Close
                  </Button>
                </div>
              </>
            )}

            {stage.name === "done" && (
              <>
                <p className="font-sans text-body text-ink">{stage.message}</p>
                <Button onClick={close} className="self-start">
                  Done
                </Button>
              </>
            )}

            {stage.name === "draft" && (
              <>
                {stage.draft.excerpt && (
                  <p className="rounded-sm bg-muted/50 p-2 text-xs italic text-muted-foreground">&ldquo;{stage.draft.excerpt}&rdquo;</p>
                )}
                {stage.draft.fields.length > 0 && (
                  <dl className="grid grid-cols-1 gap-1 text-sm">
                    {stage.draft.fields.map((f) => (
                      <div key={f.key} className="flex gap-1">
                        <dt className="text-muted-foreground">{f.label}:</dt>
                        <dd>{displayValue(f.key, f.value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {!stage.draft.convertible && (
                  <p className="font-sans text-body text-ink-2">
                    I couldn&apos;t tell where this belongs. You can discard it, or type it into the Add or dump a
                    thought bar and I&apos;ll sort it out.
                  </p>
                )}

                {stage.draft.convertible && stage.draft.recordType && RECORD_TYPES_NEEDING_PERSON.includes(stage.draft.recordType) && (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="snap-person" className="text-xs text-muted-foreground">
                      Who is this about?{stage.draft.mentionedName ? ` (mentioned as “${stage.draft.mentionedName}”)` : ""}
                    </label>
                    <select
                      id="snap-person"
                      value={personId}
                      onChange={(e) => setPersonId(e.target.value)}
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="">Choose a person…</option>
                      {stage.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname || p.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {actionError && <p className="text-sm text-destructive">{actionError}</p>}
                <div className="flex gap-2">
                  {stage.draft.convertible && (
                    <Button
                      disabled={
                        saving ||
                        (!!stage.draft.recordType && RECORD_TYPES_NEEDING_PERSON.includes(stage.draft.recordType) && !personId)
                      }
                      onClick={() => void add(stage.draft)}
                    >
                      {saving ? "Adding…" : "Add it"}
                    </Button>
                  )}
                  <Button variant="outline" disabled={saving} onClick={() => void discard(stage.draft)}>
                    Discard
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
