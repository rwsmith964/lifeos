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
  status: "ready" | "needs_clarification" | "unrecognized" | "unavailable" | "error";
  question?: string | null;
  confirmationMessage?: string | null;
  message?: string;
}

export function CapturePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [turns, setTurns] = useState<CaptureTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { aiAvailable } = useAiHealth();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

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

  function closeAndReset() {
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
        aria-label="Ask, add, or dump a thought"
      >
        <div className="flex items-center justify-between border-b border-line px-[18px] py-3">
          <p className="font-sans text-metadata text-meta">Ask, add, or dump a thought</p>
          <div className="flex items-center gap-3">
            {/* D-066: brain dump is a full-page flow (long transcript,
                multi-item review), so it can't live inside this overlay --
                this link is its main entry point. */}
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
            placeholder={listening ? "Listening…" : "Ask, add, or dump a thought…"}
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
