"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, Check, History, Mic, MicOff, RotateCcw, Trash2 } from "lucide-react";
import { useAiHealth } from "@/lib/hooks/use-ai-health";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { deleteBrainDumpBatchAction } from "./brain-dump-batch-actions";
import type { BrainDumpParseStatus } from "@/lib/db/database.types";

// Same ambient Web Speech API shape as components/capture/capture-button.tsx
// (D-048) — duplicated rather than imported since it's a tiny type-only
// interface and the two components don't otherwise share client state.
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const ACTION_TYPES = [
  "add_interest",
  "log_interaction",
  "record_gift",
  "create_calendar_event",
  "append_person_note",
  "add_gift_budget",
  "add_time_off",
] as const;
type ActionType = (typeof ACTION_TYPES)[number];

const TYPE_LABELS: Record<ActionType, string> = {
  add_interest: "Interest",
  log_interaction: "Logged interaction",
  record_gift: "Gift idea",
  create_calendar_event: "Calendar event",
  append_person_note: "Person note",
  add_gift_budget: "Gift budget",
  add_time_off: "Time off",
};

interface PersonOption {
  id: string;
  label: string;
}

// Minimal shape the server passes down from brain_dump_batches for the
// history list (P3-7) — deliberately not the full row (e.g. items/jsonb
// isn't needed client-side; re-running always re-fetches fresh items from
// the parse endpoint rather than resuming a stored review state).
export interface BrainDumpBatchSummary {
  id: string;
  transcript: string;
  parse_status: BrainDumpParseStatus;
  parse_message: string | null;
  saved_count: number;
  created_at: string;
}

// Friendly labels only — the raw parse_status enum never reaches the UI
// (ground rule: no raw enum values shown to the user).
const BATCH_STATUS_LABEL: Record<BrainDumpParseStatus, string> = {
  pending: "Processing…",
  ready: "Processed",
  unavailable: "Unavailable",
  error: "Couldn't process",
};
const BATCH_STATUS_BADGE_VARIANT: Record<BrainDumpParseStatus, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  ready: "default",
  unavailable: "secondary",
  error: "destructive",
};

// Superset of every field any action type needs (mirrors BrainDumpItem /
// CaptureAction), plus client-only bookkeeping. Kept as one flat shape so
// switching an item's `type` in the review UI never loses data the user
// already typed into a field that another type also uses.
interface EditableItem {
  clientId: string;
  type: ActionType;
  summary: string;
  personId: string | null;
  interest: string;
  interestStrength: "casual" | "regular" | "passionate";
  interactionType: "call" | "text" | "in_person" | "activity" | "other";
  interactionNotes: string;
  giftDescription: string;
  giftOccasionType: "birthday" | "christmas" | "anniversary" | "graduation" | "just_because" | "default";
  giftOccasionDate: string;
  giftCostDollars: string;
  eventTitle: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  eventAllDay: boolean;
  eventDateApproximate: boolean;
  eventType: "personal" | "work" | "family" | "kid_activity" | "travel";
  noteText: string;
  budgetOccasionType: "birthday" | "christmas" | "anniversary" | "graduation" | "just_because" | "default";
  budgetMinDollars: string;
  budgetMaxDollars: string;
  timeOffStartDate: string;
  timeOffEndDate: string;
  timeOffReason: string;
  status: "pending" | "saving" | "saved" | "error";
  errorMessage: string | null;
}

interface ParsedApiItem {
  type: ActionType;
  summary: string;
  personId: string | null;
  interest: string | null;
  interestStrength: "casual" | "regular" | "passionate" | null;
  interactionType: "call" | "text" | "in_person" | "activity" | "other" | null;
  interactionNotes: string | null;
  giftDescription: string | null;
  giftOccasionType: "birthday" | "christmas" | "anniversary" | "graduation" | "just_because" | "default" | null;
  giftOccasionDate: string | null;
  giftCostDollars: number | null;
  eventTitle: string | null;
  eventStartsAtISO: string | null;
  eventEndsAtISO: string | null;
  eventAllDay: boolean | null;
  eventDateApproximate: boolean | null;
  eventType: "personal" | "work" | "family" | "kid_activity" | "travel" | null;
  noteText: string | null;
  budgetOccasionType: "birthday" | "christmas" | "anniversary" | "graduation" | "just_because" | "default" | null;
  budgetMinDollars: number | null;
  budgetMaxDollars: number | null;
  timeOffStartDate: string | null;
  timeOffEndDate: string | null;
  timeOffReason: string | null;
}

let clientIdCounter = 0;
function nextClientId(): string {
  clientIdCounter += 1;
  return `item-${clientIdCounter}`;
}

function isoToDateAndTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  return { date: format(parsed, "yyyy-MM-dd"), time: format(parsed, "HH:mm") };
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const next = (h + 1) % 24;
  return `${String(next).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fromApiItem(item: ParsedApiItem): EditableItem {
  const allDay = item.eventAllDay ?? false;
  const start = isoToDateAndTime(item.eventStartsAtISO);
  const end = isoToDateAndTime(item.eventEndsAtISO);
  return {
    clientId: nextClientId(),
    type: item.type,
    summary: item.summary,
    personId: item.personId,
    interest: item.interest ?? "",
    interestStrength: item.interestStrength ?? "casual",
    interactionType: item.interactionType ?? "in_person",
    interactionNotes: item.interactionNotes ?? "",
    giftDescription: item.giftDescription ?? "",
    giftOccasionType: item.giftOccasionType ?? "just_because",
    giftOccasionDate: item.giftOccasionDate ?? "",
    giftCostDollars: item.giftCostDollars != null ? String(item.giftCostDollars) : "",
    eventTitle: item.eventTitle ?? "",
    eventDate: start.date,
    // P0-4: only default to a clock time when the model actually gave one
    // and it isn't an all-day event — never invent 9am/10am out of thin
    // air, which used to happen for every event with no stated time.
    eventStartTime: allDay ? "" : start.time,
    eventEndTime: allDay ? "" : end.time || (start.time ? addOneHour(start.time) : ""),
    eventAllDay: allDay,
    eventDateApproximate: item.eventDateApproximate ?? false,
    eventType: item.eventType ?? "personal",
    noteText: item.noteText ?? "",
    budgetOccasionType: item.budgetOccasionType ?? "default",
    budgetMinDollars: item.budgetMinDollars != null ? String(item.budgetMinDollars) : "",
    budgetMaxDollars: item.budgetMaxDollars != null ? String(item.budgetMaxDollars) : "",
    timeOffStartDate: item.timeOffStartDate ?? "",
    timeOffEndDate: item.timeOffEndDate ?? "",
    timeOffReason: item.timeOffReason ?? "",
    status: "pending",
    errorMessage: null,
  };
}

function isItemValid(item: EditableItem): boolean {
  switch (item.type) {
    case "add_interest":
      return !!item.personId && item.interest.trim().length > 0;
    case "log_interaction":
      return !!item.personId;
    case "record_gift":
      return !!item.personId && item.giftDescription.trim().length > 0;
    case "add_gift_budget":
      return !!item.personId;
    case "append_person_note":
      return !!item.personId && item.noteText.trim().length > 0;
    case "create_calendar_event":
      // P0-4: all-day events don't need a time; timed events do — an
      // empty time field is now a real "not entered yet" state, not a
      // silently-defaulted 09:00, so it must block Save until filled in.
      return (
        item.eventTitle.trim().length > 0 &&
        item.eventDate.length > 0 &&
        (item.eventAllDay || item.eventStartTime.length > 0)
      );
    case "add_time_off":
      return item.timeOffStartDate.length > 0;
  }
}

// Builds the exact payload app/api/brain-dump/execute expects — only the
// fields relevant to item.type are populated, everything else null, same
// contract the AI itself follows server-side.
function toExecutePayload(item: EditableItem): Record<string, unknown> {
  const base = {
    type: item.type,
    personId: item.personId,
    interest: null as string | null,
    interestStrength: null as string | null,
    interactionType: null as string | null,
    interactionNotes: null as string | null,
    giftDescription: null as string | null,
    giftOccasionType: null as string | null,
    giftOccasionDate: null as string | null,
    giftCostDollars: null as number | null,
    eventTitle: null as string | null,
    eventStartsAtISO: null as string | null,
    eventEndsAtISO: null as string | null,
    // Both fields are required keys on brainDumpItemSchema (nullable, not
    // optional) — omitting either from this object entirely would drop it
    // from the JSON body and fail server-side validation for every item
    // type, not just calendar events.
    eventAllDay: null as boolean | null,
    eventDateApproximate: null as boolean | null,
    eventType: null as string | null,
    noteText: null as string | null,
    budgetOccasionType: null as string | null,
    budgetMinDollars: null as number | null,
    budgetMaxDollars: null as number | null,
    timeOffStartDate: null as string | null,
    timeOffEndDate: null as string | null,
    timeOffReason: null as string | null,
  };

  switch (item.type) {
    case "add_interest":
      return { ...base, interest: item.interest.trim(), interestStrength: item.interestStrength };
    case "log_interaction":
      return { ...base, interactionType: item.interactionType, interactionNotes: item.interactionNotes.trim() || null };
    case "record_gift":
      return {
        ...base,
        giftDescription: item.giftDescription.trim(),
        giftOccasionType: item.giftOccasionType,
        giftOccasionDate: item.giftOccasionDate || null,
        giftCostDollars: item.giftCostDollars ? Number(item.giftCostDollars) : null,
      };
    case "add_gift_budget":
      return {
        ...base,
        budgetOccasionType: item.budgetOccasionType,
        budgetMinDollars: item.budgetMinDollars ? Number(item.budgetMinDollars) : 0,
        budgetMaxDollars: item.budgetMaxDollars ? Number(item.budgetMaxDollars) : 0,
      };
    case "append_person_note":
      return { ...base, noteText: item.noteText.trim() };
    case "create_calendar_event": {
      // P0-4: all-day events are stored midnight-to-midnight; timed events
      // use the times the user actually entered (never a silent default).
      const startsAt = item.eventAllDay
        ? new Date(`${item.eventDate}T00:00:00`).toISOString()
        : new Date(`${item.eventDate}T${item.eventStartTime}:00`).toISOString();
      const endsAt = item.eventAllDay
        ? new Date(`${item.eventDate}T23:59:59`).toISOString()
        : new Date(`${item.eventDate}T${item.eventEndTime || addOneHour(item.eventStartTime)}:00`).toISOString();
      return {
        ...base,
        eventTitle: item.eventTitle.trim(),
        eventStartsAtISO: startsAt,
        eventEndsAtISO: endsAt,
        eventAllDay: item.eventAllDay,
        eventDateApproximate: item.eventDateApproximate,
        eventType: item.eventType,
      };
    }
    case "add_time_off":
      return {
        ...base,
        timeOffStartDate: item.timeOffStartDate,
        timeOffEndDate: item.timeOffEndDate || null,
        timeOffReason: item.timeOffReason.trim() || null,
      };
  }
}

export function BrainDumpClient({
  people,
  initialBatches,
}: {
  people: PersonOption[];
  initialBatches: BrainDumpBatchSummary[];
}) {
  const router = useRouter();
  const { aiAvailable } = useAiHealth();
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseMessage, setParseMessage] = useState<string | null>(null);
  const [items, setItems] = useState<EditableItem[] | null>(null);
  // P3-7: the batch this transcript/review is tied to, so saves get
  // attributed to it and re-running (without editing the text) updates
  // the same row instead of creating a duplicate. Cleared whenever the
  // user starts typing genuinely new content (see the textarea onChange
  // below) or starts over.
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function getRecognitionCtor(): SpeechRecognitionCtor | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }
  const speechSupported = getRecognitionCtor() != null;

  function toggleListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    // Unlike the Quick Capture button (one short phrase, onresult
    // overwrites), a brain dump can run long and pause between thoughts —
    // append each finalized result segment onto whatever was already in
    // the textarea instead of replacing it, so pauses don't lose earlier
    // speech and the user can keep talking after editing by hand.
    const baseTranscriptRef = { current: transcript };
    recognition.onresult = (event) => {
      let liveText = "";
      for (let i = 0; i < event.results.length; i++) {
        liveText += event.results[i][0].transcript;
      }
      const prefix = baseTranscriptRef.current ? `${baseTranscriptRef.current} ` : "";
      setTranscript(prefix + liveText);
      // Dictating more speech changes the transcript itself, so the next
      // Process should create a new batch rather than silently re-running
      // whatever batch an earlier attempt on the old text left active.
      setActiveBatchId(null);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  // `overrideText`/`overrideBatchId` let the history list's Re-run button
  // kick off a parse immediately (loading the stored transcript and its
  // batch id in the same call) instead of waiting a render cycle for
  // state to settle. Plain "Process" clicks call this with no arguments,
  // falling back to current state as before.
  async function processTranscript(overrideText?: string, overrideBatchId?: string | null) {
    const text = (overrideText ?? transcript).trim();
    const batchIdToUse = overrideBatchId !== undefined ? overrideBatchId : activeBatchId;
    if (!text || parsing) return;
    recognitionRef.current?.stop();
    setListening(false);
    setParsing(true);
    setParseMessage(null);

    try {
      const res = await fetch("/api/brain-dump/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batchIdToUse ? { batchId: batchIdToUse } : { transcript: text }),
      });
      const data = (await res.json()) as { batchId?: string; status: string; items?: ParsedApiItem[]; message?: string };
      if (data.batchId) setActiveBatchId(data.batchId);
      if (data.status === "ready" && data.items) {
        if (data.items.length === 0) {
          setParseMessage("Didn't find anything to save in that — add more detail and try again, or edit it below.");
        } else {
          setItems(data.items.map(fromApiItem));
        }
      } else {
        setParseMessage(data.message ?? "Couldn't process that — try again.");
      }
      // Refresh the history list underneath so its status/preview reflects
      // what just happened, whether this was a fresh dump or a re-run.
      router.refresh();
    } catch {
      setParseMessage("Couldn't reach the server — try again.");
    } finally {
      setParsing(false);
    }
  }

  function rerunBatch(batch: BrainDumpBatchSummary) {
    setTranscript(batch.transcript);
    setParseMessage(null);
    setItems(null);
    void processTranscript(batch.transcript, batch.id);
  }

  function updateItem(clientId: string, patch: Partial<EditableItem>) {
    setItems((prev) => (prev ? prev.map((it) => (it.clientId === clientId ? { ...it, ...patch } : it)) : prev));
  }

  function discardItem(clientId: string) {
    setItems((prev) => (prev ? prev.filter((it) => it.clientId !== clientId) : prev));
  }

  async function saveItem(clientId: string) {
    const item = items?.find((it) => it.clientId === clientId);
    if (!item || !isItemValid(item)) return;
    updateItem(clientId, { status: "saving", errorMessage: null });
    try {
      const res = await fetch("/api/brain-dump/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: toExecutePayload(item), batchId: activeBatchId ?? undefined }),
      });
      const data = (await res.json()) as { status: string; message?: string };
      if (data.status === "ready") {
        updateItem(clientId, { status: "saved", errorMessage: null });
        router.refresh();
      } else {
        updateItem(clientId, { status: "error", errorMessage: data.message ?? "Couldn't save that." });
      }
    } catch {
      updateItem(clientId, { status: "error", errorMessage: "Couldn't reach the server — try again." });
    }
  }

  async function saveAll() {
    if (!items) return;
    for (const item of items) {
      if (item.status === "pending" && isItemValid(item)) {
        // Sequential, not Promise.all: several items can target the same
        // person (e.g. append_person_note then add_interest for the same
        // person) and this keeps save order predictable and easy to
        // reason about in the UI (one spinner active at a time) rather
        // than racing several writes at once.
        await saveItem(item.clientId);
      }
    }
  }

  function startOver() {
    setItems(null);
    setTranscript("");
    setParseMessage(null);
    setActiveBatchId(null);
  }

  const pendingCount = items?.filter((it) => it.status === "pending" || it.status === "error").length ?? 0;
  const savedCount = items?.filter((it) => it.status === "saved").length ?? 0;
  // P0-4: "Save all" used to stay enabled and silently skip incomplete
  // items instead of blocking — now it's disabled until every pending
  // item is filled in, with a message pointing at what's missing.
  const incompletePendingCount = items?.filter((it) => it.status === "pending" && !isItemValid(it)).length ?? 0;

  if (!items) {
    return (
      <div className="flex flex-col gap-3">
        {aiAvailable === false && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Brain dump is temporarily unavailable. Try again in a few minutes.
          </p>
        )}
        <Textarea
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            // Editing the transcript by hand means this is no longer the
            // stored text for whatever batch was active (a fresh dump, or
            // a re-run the user is now tweaking) — the next Process
            // should create its own new batch rather than overwrite one
            // whose stored transcript would then no longer match.
            setActiveBatchId(null);
          }}
          placeholder={listening ? "Listening…" : "Ramble away — mention people, events, gift ideas, notes, time off, anything."}
          disabled={aiAvailable === false}
          className="min-h-40"
        />
        <div className="flex items-center gap-2">
          {speechSupported && (
            <button
              type="button"
              aria-label={listening ? "Stop dictation" : "Start dictation"}
              onClick={toggleListening}
              disabled={aiAvailable === false}
              className={
                listening
                  ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                  : "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
              }
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
          )}
          <Button
            className="flex-1"
            disabled={parsing || !transcript.trim() || aiAvailable === false}
            onClick={() => void processTranscript()}
          >
            {parsing ? "Reading through that…" : "Process"}
          </Button>
        </div>
        {parseMessage && <p className="text-sm text-muted-foreground">{parseMessage}</p>}

        {initialBatches.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <History className="size-4" />
              Past brain dumps
            </div>
            {initialBatches.map((batch) => (
              <Card key={batch.id}>
                <CardContent className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-foreground">{batch.transcript}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDistanceToNow(new Date(batch.created_at), { addSuffix: true })}</span>
                      <Badge variant={BATCH_STATUS_BADGE_VARIANT[batch.parse_status]}>
                        {BATCH_STATUS_LABEL[batch.parse_status]}
                      </Badge>
                      {batch.saved_count > 0 && <span>{batch.saved_count} saved</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={parsing}
                      onClick={() => rerunBatch(batch)}
                      aria-label="Re-run this brain dump"
                    >
                      <RotateCcw className="size-3.5" />
                      Re-run
                    </Button>
                    <ConfirmDeleteButton
                      action={() => deleteBrainDumpBatchAction(batch.id)}
                      label="Delete"
                      confirmLabel="Delete brain dump"
                      dialogTitle="Delete this brain dump?"
                      dialogDescription="This removes the saved transcript from your history. Anything you already saved from it stays untouched."
                      successMessage="Brain dump removed."
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pendingCount > 0 ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} to review` : "All done"}
          {savedCount > 0 ? ` · ${savedCount} saved` : ""}
        </p>
        {pendingCount > 0 && (
          <Button size="sm" disabled={incompletePendingCount > 0} onClick={() => void saveAll()}>
            Save all
          </Button>
        )}
      </div>

      {incompletePendingCount > 0 && (
        <p className="text-xs text-amber-600">
          {incompletePendingCount === 1
            ? "Finish the highlighted item below before saving all."
            : `Finish the ${incompletePendingCount} highlighted items below before saving all.`}
        </p>
      )}

      {items.map((item) => (
        <BrainDumpItemCard
          key={item.clientId}
          item={item}
          people={people}
          onChange={(patch) => updateItem(item.clientId, patch)}
          onSave={() => void saveItem(item.clientId)}
          onDiscard={() => discardItem(item.clientId)}
        />
      ))}

      {pendingCount === 0 && (
        <Button variant="outline" onClick={startOver}>
          Record another dump
        </Button>
      )}
    </div>
  );
}

function BrainDumpItemCard({
  item,
  people,
  onChange,
  onSave,
  onDiscard,
}: {
  item: EditableItem;
  people: PersonOption[];
  onChange: (patch: Partial<EditableItem>) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const selectClass = "border-input h-9 rounded-md border bg-transparent px-3 text-sm";
  const disabled = item.status === "saving" || item.status === "saved";
  // P0-4: flag the item visually (not just via the disabled Save button)
  // so it's obvious which pending card is blocking "Save all".
  const incomplete = item.status === "pending" && !isItemValid(item);

  return (
    <Card
      className={
        item.status === "saved"
          ? "opacity-60"
          : incomplete
            ? "border-amber-400 dark:border-amber-600"
            : undefined
      }
    >
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm">{item.summary}</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={item.type}
              disabled={disabled}
              onChange={(e) => onChange({ type: e.target.value as ActionType })}
              className={selectClass + " h-7 px-2 text-xs"}
              aria-label="Item type"
            >
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {item.status === "saved" && (
              <Badge variant="secondary" className="gap-1">
                <Check className="size-3" /> Saved
              </Badge>
            )}
          </div>
        </div>
        {!disabled && (
          <button type="button" aria-label="Discard item" onClick={onDiscard} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {item.type !== "create_calendar_event" && (
          <div className="flex flex-col gap-1">
            <Label>Who</Label>
            <select
              value={item.personId ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ personId: e.target.value || null })}
              className={selectClass}
              aria-label="Person"
            >
              <option value="">
                {item.type === "add_time_off" ? "Me (default)" : "— Select —"}
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {item.personId == null && item.type !== "add_time_off" && (
              <p className="text-xs text-muted-foreground">
                I couldn&apos;t tell for sure who this is about — pick someone to save it.
              </p>
            )}
          </div>
        )}

        {item.type === "create_calendar_event" && (
          <div className="flex flex-col gap-1">
            <Label>With (optional)</Label>
            <select
              value={item.personId ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ personId: e.target.value || null })}
              className={selectClass}
              aria-label="Person"
            >
              <option value="">— Nobody specific —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {item.type === "add_interest" && (
          <>
            <div className="flex flex-col gap-1">
              <Label>Interest</Label>
              <Input value={item.interest} disabled={disabled} onChange={(e) => onChange({ interest: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Strength</Label>
              <select
                value={item.interestStrength}
                disabled={disabled}
                onChange={(e) => onChange({ interestStrength: e.target.value as EditableItem["interestStrength"] })}
                className={selectClass}
              >
                <option value="casual">Casual</option>
                <option value="regular">Regular</option>
                <option value="passionate">Passionate</option>
              </select>
            </div>
          </>
        )}

        {item.type === "log_interaction" && (
          <>
            <div className="flex flex-col gap-1">
              <Label>Type</Label>
              <select
                value={item.interactionType}
                disabled={disabled}
                onChange={(e) => onChange({ interactionType: e.target.value as EditableItem["interactionType"] })}
                className={selectClass}
              >
                <option value="call">Call</option>
                <option value="text">Text</option>
                <option value="in_person">In person</option>
                <option value="activity">Activity</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Notes (optional)</Label>
              <Textarea value={item.interactionNotes} disabled={disabled} onChange={(e) => onChange({ interactionNotes: e.target.value })} />
            </div>
          </>
        )}

        {item.type === "record_gift" && (
          <>
            <div className="flex flex-col gap-1">
              <Label>Gift idea</Label>
              <Input value={item.giftDescription} disabled={disabled} onChange={(e) => onChange({ giftDescription: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>Occasion</Label>
                <select
                  value={item.giftOccasionType}
                  disabled={disabled}
                  onChange={(e) => onChange({ giftOccasionType: e.target.value as EditableItem["giftOccasionType"] })}
                  className={selectClass}
                >
                  <option value="birthday">Birthday</option>
                  <option value="christmas">Christmas</option>
                  <option value="anniversary">Anniversary</option>
                  <option value="graduation">Graduation</option>
                  <option value="just_because">Just because</option>
                  <option value="default">Default</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Cost (optional)</Label>
                <Input
                  type="number"
                  min="0"
                  value={item.giftCostDollars}
                  disabled={disabled}
                  onChange={(e) => onChange({ giftCostDollars: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Occasion date (optional)</Label>
              <Input type="date" value={item.giftOccasionDate} disabled={disabled} onChange={(e) => onChange({ giftOccasionDate: e.target.value })} />
            </div>
          </>
        )}

        {item.type === "add_gift_budget" && (
          <>
            <div className="flex flex-col gap-1">
              <Label>Occasion</Label>
              <select
                value={item.budgetOccasionType}
                disabled={disabled}
                onChange={(e) => onChange({ budgetOccasionType: e.target.value as EditableItem["budgetOccasionType"] })}
                className={selectClass}
              >
                <option value="birthday">Birthday</option>
                <option value="christmas">Christmas</option>
                <option value="anniversary">Anniversary</option>
                <option value="graduation">Graduation</option>
                <option value="just_because">Just because</option>
                <option value="default">Default</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>Min ($)</Label>
                <Input type="number" min="0" value={item.budgetMinDollars} disabled={disabled} onChange={(e) => onChange({ budgetMinDollars: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Max ($)</Label>
                <Input type="number" min="0" value={item.budgetMaxDollars} disabled={disabled} onChange={(e) => onChange({ budgetMaxDollars: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {item.type === "append_person_note" && (
          <div className="flex flex-col gap-1">
            <Label>Note</Label>
            <Textarea value={item.noteText} disabled={disabled} onChange={(e) => onChange({ noteText: e.target.value })} />
          </div>
        )}

        {item.type === "create_calendar_event" && (
          <>
            <div className="flex flex-col gap-1">
              <Label>Title</Label>
              <Input value={item.eventTitle} disabled={disabled} onChange={(e) => onChange({ eventTitle: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Label>Date</Label>
                {item.eventDateApproximate && (
                  <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600 dark:border-amber-600">
                    <AlertTriangle className="size-3" /> Guessed — double-check
                  </Badge>
                )}
              </div>
              <Input type="date" value={item.eventDate} disabled={disabled} onChange={(e) => onChange({ eventDate: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.eventAllDay}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    eventAllDay: e.target.checked,
                    eventStartTime: e.target.checked ? "" : item.eventStartTime || "09:00",
                    eventEndTime: e.target.checked ? "" : item.eventEndTime || "10:00",
                  })
                }
              />
              All day
            </label>
            {!item.eventAllDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label>Start</Label>
                  <Input type="time" value={item.eventStartTime} disabled={disabled} onChange={(e) => onChange({ eventStartTime: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Label>End</Label>
                    {!item.eventEndTime && (
                      <span className="text-xs text-muted-foreground">not stated</span>
                    )}
                  </div>
                  <Input type="time" value={item.eventEndTime} disabled={disabled} onChange={(e) => onChange({ eventEndTime: e.target.value })} />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label>Type</Label>
              <select
                value={item.eventType}
                disabled={disabled}
                onChange={(e) => onChange({ eventType: e.target.value as EditableItem["eventType"] })}
                className={selectClass}
              >
                <option value="personal">Personal</option>
                <option value="work">Work</option>
                <option value="family">Family</option>
                <option value="kid_activity">Kid activity</option>
                <option value="travel">Travel</option>
              </select>
            </div>
          </>
        )}

        {item.type === "add_time_off" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>Start date</Label>
                <Input type="date" value={item.timeOffStartDate} disabled={disabled} onChange={(e) => onChange({ timeOffStartDate: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>End date (optional)</Label>
                <Input type="date" value={item.timeOffEndDate} disabled={disabled} onChange={(e) => onChange({ timeOffEndDate: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Reason (optional)</Label>
              <Input value={item.timeOffReason} disabled={disabled} onChange={(e) => onChange({ timeOffReason: e.target.value })} />
            </div>
          </>
        )}

        {item.errorMessage && <p className="text-sm text-destructive">{item.errorMessage}</p>}

        {!disabled && (
          <Button size="sm" disabled={!isItemValid(item) || item.status === "saving"} onClick={onSave}>
            {item.status === "saving" ? "Saving…" : item.status === "error" ? "Retry" : "Save"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
