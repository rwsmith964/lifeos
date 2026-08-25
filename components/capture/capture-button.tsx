"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import { useAiHealth } from "@/lib/hooks/use-ai-health";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Minimal ambient shape for the Web Speech API — not in lib.dom.d.ts, and
// only Chrome/Edge/Safari ship it (as the prefixed webkitSpeechRecognition).
// The capture panel always has a text-input fallback, so this is a progressive
// enhancement, not a requirement.
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

export function CaptureButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<CaptureTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { aiAvailable } = useAiHealth();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

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
        setTurns((prev) => [...prev, { role: "assistant", text: data.message ?? "Something went wrong.", tone: "error" }]);
      }
    } catch {
      setTurns((prev) => [...prev, { role: "assistant", text: "Couldn't reach the server — try again.", tone: "error" }]);
    } finally {
      setPending(false);
    }
  }

  function closeAndReset() {
    recognitionRef.current?.stop();
    setListening(false);
    setOpen(false);
    setTurns([]);
    setInput("");
  }

  const speechSupported = getRecognitionCtor() != null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        aria-label="Quick capture"
        className="fixed bottom-20 right-4 z-40 size-12 rounded-full shadow-lg"
      >
        <Sparkles className="size-5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={closeAndReset}>
          <div
            className="flex w-full max-w-md flex-col rounded-t-xl bg-background"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Quick capture</p>
              <button type="button" aria-label="Close" onClick={closeAndReset} className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3" style={{ minHeight: 120 }}>
              {aiAvailable === false && (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Quick Capture is temporarily unavailable. Try again in a few minutes.
                </p>
              )}
              {turns.length === 0 && aiAvailable !== false && (
                <p className="text-sm text-muted-foreground">
                  Say or type anything — a note about someone, a gift idea, something to put on the calendar. I&apos;ll
                  ask if I need more detail.
                </p>
              )}
              {turns.map((turn, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    turn.role === "user"
                      ? "self-end bg-primary text-primary-foreground"
                      : turn.tone === "error"
                        ? "self-start bg-destructive/10 text-destructive"
                        : "self-start bg-muted text-foreground"
                  )}
                >
                  {turn.text}
                </div>
              ))}
              {pending && <div className="self-start text-xs text-muted-foreground">Thinking…</div>}
            </div>

            <div className="flex items-center gap-2 border-t px-4 py-3">
              {speechSupported && (
                <button
                  type="button"
                  aria-label={listening ? "Stop dictation" : "Start dictation"}
                  onClick={toggleListening}
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    listening ? "bg-destructive text-destructive-foreground" : "bg-muted text-foreground"
                  )}
                >
                  {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={listening ? "Listening…" : "Type or dictate a note…"}
                disabled={aiAvailable === false}
                className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-50"
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
      )}
    </>
  );
}
