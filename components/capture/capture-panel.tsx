"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Send, X } from "lucide-react";
import { useAiHealth } from "@/lib/hooks/use-ai-health";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Redesign: this is the pre-existing components/capture/capture-button.tsx
// with its trigger stripped out (now components/capture/command-bar.tsx and
// the mobile tab bar button, both via useCapture()) and its overlay
// restyled from a mobile bottom-sheet to Part 3's "⌘K overlay" (a centered,
// top-anchored panel). Every piece of actual behaviour -- the turn history,
// dictation, the /api/capture call, error/clarification handling -- is
// unchanged from the original component; only presentation and how it's
// triggered moved.
/** sessionStorage key carrying text from Quick Capture to Brain Dump. */
import { PLAN_DAY_HANDOFF_KEY } from "@/lib/planning/detect";

export const BRAIN_DUMP_HANDOFF_KEY = "lifeos:brain-dump-handoff";

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

interface CaptureTurn {
  role: "user" | "assistant";
  text: string;
  tone?: "question" | "confirmation" | "error";
}

interface CaptureApiResponse {
  status: "ready" | "needs_clarification" | "unrecognized" | "unavailable" | "error" | "navigate" | "handoff" | "confirm";
  href?: string;
  target?: "plan-day" | "brain-dump";
  question?: string | null;
  confirmationMessage?: string | null;
  message?: string;
  /** For status "confirm": the full parsed item (sent back on Add) and what to show. */
  item?: unknown;
  preview?: { title: string; startsAtISO: string; endsAtISO: string | null; allDay: boolean; withName: string | null };
}

/** An event Quick Capture understood, shown for a last look before it is saved. */
interface PendingEvent {
  item: unknown;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  notes: string;
  withName: string | null;
}

// The model's ISO strings are the person's own wall-clock time; read the digits as written.
function pendingEventFrom(data: CaptureApiResponse): PendingEvent | null {
  const p = data.preview;
  if (!p) return null;
  const startDate = p.startsAtISO.slice(0, 10);
  const startTime = p.allDay ? "" : p.startsAtISO.slice(11, 16);
  const endDate = p.endsAtISO ? p.endsAtISO.slice(0, 10) : startDate;
  const endTime = p.allDay || !p.endsAtISO ? "" : p.endsAtISO.slice(11, 16);
  return { item: data.item, title: p.title, startDate, startTime, endDate, endTime, allDay: p.allDay, notes: "", withName: p.withName };
}

export function CapturePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [turns, setTurns] = useState<CaptureTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<PendingEvent | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { aiAvailable } = useAiHealth();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, pendingEvent]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function getRecognitionCtor(): SpeechRecognitionCtor | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

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
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function send() {
    const text = input.trim();
    if (!text || pending) return;

    recognitionRef.current?.stop();
    setListening(false);
    setInput("");
    setPendingEvent(null); // typing something new walks away from an unsaved card
    const nextTurns: CaptureTurn[] = [...turns, { role: "user", text }];
    setTurns(nextTurns);
    setPending(true);

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: nextTurns.map((t) => ({ role: t.role, text: t.text })) }),
      });
      const data = (await res.json()) as CaptureApiResponse;

      if (data.status === "needs_clarification" && data.question) {
        setTurns((prev) => [...prev, { role: "assistant", text: data.question!, tone: "question" }]);
      } else if (data.status === "confirm") {
        const event = pendingEventFrom(data);
        if (event) setPendingEvent(event);
        else setTurns((prev) => [...prev, { role: "assistant", text: "Something went wrong.", tone: "error" }]);
      } else if (data.status === "handoff") {
        // More than one thing: Brain Dump processes it all and shows a review list.
        const toPlanner = data.target === "plan-day";
        try {
          sessionStorage.setItem(
            toPlanner ? PLAN_DAY_HANDOFF_KEY : BRAIN_DUMP_HANDOFF_KEY,
            nextTurns.filter((t) => t.role === "user").map((t) => t.text).join(". ")
          );
        } catch {
          // Storage blocked: the next page opens empty and the text can be pasted in.
        }
        closeAndReset();
        router.push(toPlanner ? "/plan-day" : "/brain-dump");
        return;
      } else if (data.status === "navigate" && data.href) {
        // A request answered by its own page (e.g. "find a time for ...").
        closeAndReset();
        router.push(data.href);
        return;
      } else if (data.status === "ready") {
        setTurns((prev) => [
          ...prev,
          { role: "assistant", text: data.confirmationMessage ?? "Got it — saved.", tone: "confirmation" },
        ]);
        router.refresh();
      } else if (data.status === "unrecognized") {
        setTurns((prev) => [
          ...prev,
          { role: "assistant", text: data.confirmationMessage ?? "Not sure what to do with that.", tone: "error" },
        ]);
      } else {
        setInput(text);
        setTurns((prev) => [...prev, { role: "assistant", text: data.message ?? "Something went wrong.", tone: "error" }]);
      }
    } catch {
      setInput(text);
      setTurns((prev) => [...prev, { role: "assistant", text: "Couldn't reach the server — try again.", tone: "error" }]);
    } finally {
      setPending(false);
    }
  }

  async function saveEvent() {
    if (!pendingEvent || savingEvent) return;
    const e = pendingEvent;
    if (!e.title.trim() || !e.startDate) return;
    setSavingEvent(true);
    // An end earlier than the start (same date typed) means it runs past midnight.
    const startAt = `${e.startDate}T${e.allDay ? "00:00" : e.startTime || "09:00"}:00`;
    let endAt: string | null = null;
    if (!e.allDay && e.endTime) {
      const endDate = e.endDate || e.startDate;
      endAt = `${endDate}T${e.endTime}:00`;
      if (endAt <= startAt) {
        const next = new Date(`${e.startDate}T12:00:00`);
        next.setDate(next.getDate() + 1);
        endAt = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}T${e.endTime}:00`;
      }
    }
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turns: [],
          confirmEvent: {
            item: e.item,
            eventTitle: e.title.trim(),
            eventStartsAtISO: startAt,
            eventEndsAtISO: endAt,
            eventAllDay: e.allDay,
            eventNotes: e.notes.trim() || null,
          },
        }),
      });
      const data = (await res.json()) as CaptureApiResponse;
      if (data.status === "ready") {
        setPendingEvent(null);
        setTurns((prev) => [...prev, { role: "assistant", text: data.confirmationMessage ?? "Added to your calendar.", tone: "confirmation" }]);
        router.refresh();
      } else {
        setTurns((prev) => [...prev, { role: "assistant", text: data.message ?? "Couldn't save that, try again.", tone: "error" }]);
      }
    } catch {
      setTurns((prev) => [...prev, { role: "assistant", text: "Couldn't reach the server, try again.", tone: "error" }]);
    } finally {
      setSavingEvent(false);
    }
  }

  function cancelEvent() {
    setPendingEvent(null);
    setTurns((prev) => [...prev, { role: "assistant", text: "Okay, I didn't add it.", tone: "confirmation" }]);
  }

  function closeAndReset() {
    setPendingEvent(null);
    recognitionRef.current?.stop();
    setListening(false);
    onClose();
    setTurns([]);
    setInput("");
  }

  const speechSupported = getRecognitionCtor() != null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]"
      role="presentation"
      onClick={closeAndReset}
    >
      <div
        className="flex w-full max-w-[520px] flex-col rounded-sheet border border-line bg-surface"
        style={{ maxHeight: "70vh" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add or dump a thought"
      >
        <div className="flex items-center justify-between border-b border-line px-[18px] py-3">
          <p className="font-sans text-metadata text-meta">Add or dump a thought</p>
          <div className="flex items-center gap-3">
            {/* D-066: brain dump is a full-page flow (long transcript,
                multi-item review), so it can't live inside this overlay --
                this link is its main entry point. */}
            <button
              type="button"
              onClick={() => {
                closeAndReset();
                router.push("/plan-day");
              }}
              className="font-sans text-metadata font-bold text-action hover:underline"
            >
              Plan my day →
            </button>
            <button
              type="button"
              onClick={() => {
                closeAndReset();
                router.push("/brain-dump");
              }}
              className="font-sans text-metadata font-bold text-action hover:underline"
            >
              Brain dump →
            </button>
            <button type="button" aria-label="Close" onClick={closeAndReset} className="text-ink-2 hover:text-ink">
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-[18px] py-3" style={{ minHeight: 120 }}>
          {aiAvailable === false && (
            <p className="rounded-input bg-surface-2 px-3 py-2 font-sans text-metadata text-ink-2">
              Quick Capture is temporarily unavailable. Try again in a few minutes.
            </p>
          )}
          {turns.length === 0 && aiAvailable !== false && (
            <p className="font-sans text-body text-ink-2">
              Say or type anything — a note about someone, a gift idea, something to put on the calendar. I&apos;ll ask
              if I need more detail.
            </p>
          )}
          {turns.map((turn, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-input px-3 py-2 font-sans text-body",
                turn.role === "user"
                  ? "self-end bg-action text-on-action"
                  : turn.tone === "error"
                    ? "self-start bg-destructive-soft-bg text-destructive-soft-fg"
                    : "self-start bg-surface-2 text-ink"
              )}
            >
              {turn.text}
            </div>
          ))}
          {pending && <div className="self-start font-sans text-metadata text-meta">Thinking…</div>}
          {pendingEvent && (
            <div className="flex flex-col gap-2 rounded-input border border-line bg-surface-2 p-3" role="group" aria-label="Add this to your calendar?">
              <p className="font-sans text-body font-bold text-ink">Add this to your calendar?</p>
              <input
                aria-label="Title"
                value={pendingEvent.title}
                onChange={(ev) => setPendingEvent({ ...pendingEvent, title: ev.target.value })}
                className="h-9 rounded-input border border-line bg-surface px-3 font-sans text-body text-ink outline-none focus-visible:ring-2 focus-visible:ring-action/50"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 font-sans text-metadata text-meta">
                  Starts
                  <input type="date" value={pendingEvent.startDate} onChange={(ev) => setPendingEvent({ ...pendingEvent, startDate: ev.target.value })} className="h-9 rounded-input border border-line bg-surface px-2 text-body text-ink disabled:opacity-50" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-metadata text-meta">
                  &nbsp;
                  <input type="time" aria-label="Start time" disabled={pendingEvent.allDay} value={pendingEvent.startTime} onChange={(ev) => setPendingEvent({ ...pendingEvent, startTime: ev.target.value })} className="h-9 rounded-input border border-line bg-surface px-2 text-body text-ink disabled:opacity-50" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-metadata text-meta">
                  Ends
                  <input type="date" disabled={pendingEvent.allDay} value={pendingEvent.endDate} onChange={(ev) => setPendingEvent({ ...pendingEvent, endDate: ev.target.value })} className="h-9 rounded-input border border-line bg-surface px-2 text-body text-ink disabled:opacity-50" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-metadata text-meta">
                  &nbsp;
                  <input type="time" aria-label="End time" disabled={pendingEvent.allDay} value={pendingEvent.endTime} onChange={(ev) => setPendingEvent({ ...pendingEvent, endTime: ev.target.value })} className="h-9 rounded-input border border-line bg-surface px-2 text-body text-ink disabled:opacity-50" />
                </label>
              </div>
              <label className="flex items-center gap-2 font-sans text-metadata text-ink-2">
                <input type="checkbox" checked={pendingEvent.allDay} onChange={(ev) => setPendingEvent({ ...pendingEvent, allDay: ev.target.checked })} />
                All day
              </label>
              {pendingEvent.withName && <p className="font-sans text-metadata text-meta">With {pendingEvent.withName}</p>}
              <input
                aria-label="Notes"
                placeholder="Add a note (optional)"
                value={pendingEvent.notes}
                onChange={(ev) => setPendingEvent({ ...pendingEvent, notes: ev.target.value })}
                className="h-9 rounded-input border border-line bg-surface px-3 font-sans text-body text-ink outline-none placeholder:text-meta focus-visible:ring-2 focus-visible:ring-action/50"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={savingEvent || !pendingEvent.title.trim() || !pendingEvent.startDate} onClick={() => void saveEvent()}>
                  {savingEvent ? "Adding…" : "Add to calendar"}
                </Button>
                <Button size="sm" variant="outline" disabled={savingEvent} onClick={cancelEvent}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-[18px] py-3">
          {speechSupported && (
            <button
              type="button"
              aria-label={listening ? "Stop dictation" : "Start dictation"}
              onClick={toggleListening}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-input motion-safe-transition",
                listening ? "bg-destructive-soft-bg text-destructive-soft-fg" : "bg-surface-2 text-ink-2"
              )}
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={listening ? "Listening…" : "Add or dump a thought…"}
            disabled={aiAvailable === false}
            className="h-9 flex-1 rounded-input border border-line bg-surface px-3 font-sans text-body text-ink outline-none placeholder:text-meta focus-visible:ring-2 focus-visible:ring-action/50 disabled:opacity-50"
          />
          <Button
            size="icon"
            className="size-9 shrink-0"
            disabled={pending || !input.trim() || aiAvailable === false}
            title={aiAvailable === false ? "Quick Capture is temporarily unavailable." : undefined}
            onClick={() => void send()}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
