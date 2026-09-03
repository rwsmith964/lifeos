"use client";

// Module 3 (universal_intake_v2, D-136). Talks to the existing, already
// flag-gated POST /api/intake route directly (same client-fetch pattern
// as app/(app)/calendar/custody/new/new-schedule-form.tsx's agreement
// upload) rather than duplicating its parse logic in a server action.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RECORD_TYPE_LABELS, type IntakeRecordType } from "@/lib/intake/labels";

type Mode = "text" | "photo";

interface CreatedDraftSummary {
  id: string;
  status: "pending" | "needs_review" | "ready" | "converted" | "rejected";
  detectedRecordType: IntakeRecordType | null;
}

const ACCEPTED_MEDIA_TYPES: Record<string, "image/png" | "image/jpeg" | "image/webp" | "application/pdf"> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
  "application/pdf": "application/pdf",
};

function readFileAsBase64(file: File): Promise<{ base64Data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const match = result.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) {
        reject(new Error("Couldn't read that file."));
        return;
      }
      resolve({ mediaType: match[1], base64Data: match[2] });
    };
    reader.readAsDataURL(file);
  });
}

export function IntakeCaptureForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedDraftSummary[] | null>(null);

  async function submitText() {
    if (!text.trim()) {
      setError("Paste some text first.");
      return;
    }
    await submit({ sourceType: "text", text: text.trim() });
  }

  async function submitPhoto() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a photo, screenshot, or PDF first.");
      return;
    }
    let read: { base64Data: string; mediaType: string };
    try {
      read = await readFileAsBase64(file);
    } catch {
      setError("Couldn't read that file — try a different one.");
      return;
    }
    const mediaType = ACCEPTED_MEDIA_TYPES[read.mediaType];
    if (!mediaType) {
      setError("That file type isn't supported yet — use a PNG, JPEG, WEBP, or PDF.");
      return;
    }
    await submit({ sourceType: "screenshot", base64Data: read.base64Data, mediaType });
  }

  async function submit(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status === "unavailable" || data.status === "error" || data.status === "empty") {
        setError(data.message ?? "Couldn't process that submission — try again.");
        setPending(false);
        return;
      }
      setCreated(data.drafts ?? []);
      setText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setPending(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "text" ? "default" : "outline"} onClick={() => setMode("text")}>
          Paste text
        </Button>
        <Button type="button" size="sm" variant={mode === "photo" ? "default" : "outline"} onClick={() => setMode("photo")}>
          Photo or screenshot
        </Button>
      </div>

      {mode === "text" ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. a flyer's text, a flight confirmation, or a note about something coming up"
            rows={4}
            disabled={pending}
          />
          <Button type="button" onClick={submitText} disabled={pending} className="self-start">
            {pending ? "Reading…" : "Submit"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            disabled={pending}
            className="text-sm"
          />
          <Button type="button" onClick={submitPhoto} disabled={pending} className="self-start">
            {pending ? "Reading…" : "Submit"}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {created && created.length > 0 && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">
            {created.length === 1 ? "Got it — added below." : `Got it — added ${created.length} items below.`}
          </p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {created.map((d) => (
              <li key={d.id}>
                {d.detectedRecordType ? RECORD_TYPE_LABELS[d.detectedRecordType] : "Item"} —{" "}
                {d.status === "ready" ? "high confidence, ready to approve" : "needs your review"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {created && created.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing came out of that — try a clearer excerpt.</p>
      )}
    </div>
  );
}
