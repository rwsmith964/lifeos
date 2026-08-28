"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Check, Mic, MicOff, Trash2 } from "lucide-react";
import { useAiHealth } from "@/lib/hooks/use-ai-health";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

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

function fromApiItem(item: ParsedApiItem): EditableItem {
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
    eventStartTime: start.time || "09:00",
    eventEndTime: end.time || "10:00",
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
      return item.eventTitle.trim().length > 0 && item.eventDate.length > 0;
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
      const startsAt = new Date(`${item.eventDate}T${item.eventStartTime || "09:00"}:00`).toISOString();
      const endsAt = new Date(`${item.eventDate}T${item.eventEndTime || "10:00"}:00`).toISOString();
      return { ...base, eventTitle: item.eventTitle.trim(), eventStartsAtISO: startsAt, eventEndsAtISO: endsAt, eventType: item.eventType };
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

export function BrainDumpClient({ people }: { people: PersonOption[] }) {
  const router = useRouter();
  const { aiAvailable } = useAiHealth();
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseMessage, setParseMessage] = useState<string | null>(null);
  const [items, setItems] = useState<EditableItem[] | null>(null);
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
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function processTranscript() {
    const text = transcript.trim();
    if (!text || parsing) return;
    recognitionRef.current?.stop();
    setListening(false);
    setParsing(true);
    setParseMessage(null);

    try {
      const res = await fetch("/api/brain-dump/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = (await res.json()) as { status: string; items?: ParsedApiItem[]; message?: string };
      if (data.status === "ready" && data.items) {
        if (data.items.length === 0) {
          setParseMessage("Didn't find anything to save in that — add more detail and try again, or edit it below.");
        } else {
          setItems(data.items.map(fromApiItem));
        }
      } else {
        setParseMessage(data.message ?? "Couldn't process that — try again.");
      }
    } catch {
      setParseMessage("Couldn't reach the server — try again.");
    } finally {
      setParsing(false);
    }
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
        body: JSON.stringify({ item: toExecutePayload(item) }),
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
  }

  const pendingCount = items?.filter((it) => it.status === "pending" || it.status === "error").length ?? 0;
  const savedCount = items?.filter((it) => it.status === "saved").length ?? 0;

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
          onChange={(e) => setTranscript(e.target.value)}
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
          <Button size="sm" onClick={() => void saveAll()}>
            Save all
          </Button>
        )}
      </div>

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

  return (
    <Card className={item.status === "saved" ? "opacity-60" : undefined}>
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
              <Label>Date</Label>
              <Input type="date" value={item.eventDate} disabled={disabled} onChange={(e) => onChange({ eventDate: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>Start</Label>
                <Input type="time" value={item.eventStartTime} disabled={disabled} onChange={(e) => onChange({ eventStartTime: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>End</Label>
                <Input type="time" value={item.eventEndTime} disabled={disabled} onChange={(e) => onChange({ eventEndTime: e.target.value })} />
              </div>
            </div>
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
