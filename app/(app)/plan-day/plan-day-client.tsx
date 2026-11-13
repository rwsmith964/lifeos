"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Car, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PLAN_DAY_HANDOFF_KEY } from "@/lib/planning/detect";
import type { DayPlanProposal } from "@/lib/planning/day-plan-server";
import { createDayPlanAction } from "./actions";
import { syncDepartureReminders } from "@/components/native/departure-reminders";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface TurnResponse {
  status: "asking" | "proposal" | "unavailable" | "error";
  message: string;
  proposal?: DayPlanProposal;
}

const GREETING = "What are you thinking of doing? Tell me the places, who's coming, and anything that matters, and we'll work out the plan together.";

function clock(local: string): string {
  // Naive wall-clock strings: parsed and shown in the same (browser) zone, so no shift.
  return format(new Date(local), "h:mm a");
}

export function PlanDayClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [proposal, setProposal] = useState<DayPlanProposal | null>(null);
  const [includeDrives, setIncludeDrives] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, proposal, pending]);

  async function send(text: string, history: ChatMessage[]) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const next: ChatMessage[] = [...history, { role: "user", text: trimmed }];
    setMessages(next);
    setInput("");
    setPending(true);
    setProposal(null);
    setError(null);
    try {
      const res = await fetch("/api/plan-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<TurnResponse>;
      if (!data.message) {
        setError("Couldn't reach the assistant — try again.");
        return;
      }
      if (data.status === "unavailable" || data.status === "error") {
        setError(data.message);
        return;
      }
      setMessages([...next, { role: "assistant", text: data.message }]);
      if (data.status === "proposal" && data.proposal) setProposal(data.proposal);
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  // Text handed over from Quick Capture starts the conversation.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let handed: string | null = null;
    try {
      handed = sessionStorage.getItem(PLAN_DAY_HANDOFF_KEY);
      if (handed) sessionStorage.removeItem(PLAN_DAY_HANDOFF_KEY);
    } catch {
      // Storage unavailable: start from the greeting.
    }
    if (handed) {
      const text = handed;
      void Promise.resolve().then(() => send(text, []));
    }
    // Runs once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm() {
    if (!proposal) return;
    setSaving(true);
    setError(null);
    const res = await createDayPlanAction({
      stops: proposal.stops.map((s) => ({
        name: s.name,
        personId: s.personId,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        driveMinutes: s.driveMinutes,
        departLocal: s.departLocal,
        arriveLocal: s.arriveLocal,
        leaveLocal: s.leaveLocal,
        notes: s.notes,
      })),
      childPersonIds: proposal.childPersonIds,
      includeDriveBlocks: includeDrives,
    });
    setSaving(false);
    if (res.error) return setError(res.error);
    setCreated(res.created ?? 0);
    setProposal(null);
    // In the phone app, schedule the leave-soon reminders for these drives now.
    void syncDepartureReminders().catch(() => undefined);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="max-w-[85%] self-start rounded-input bg-surface-2 px-3 py-2 font-sans text-body text-ink">{GREETING}</div>
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] whitespace-pre-line rounded-input px-3 py-2 font-sans text-body",
              m.role === "user" ? "self-end bg-action text-on-action" : "self-start bg-surface-2 text-ink"
            )}
          >
            {m.text}
          </div>
        ))}
        {pending && <div className="self-start font-sans text-metadata text-meta">Thinking…</div>}
      </div>

      {proposal && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="font-sans text-body font-bold text-ink">Here&apos;s the plan</p>
            <ol className="flex flex-col gap-2">
              {proposal.stops.map((s) => (
                <li key={s.key} className="flex flex-col gap-0.5">
                  {s.driveMinutes >= 1 && (
                    <p className="flex items-center gap-1 font-sans text-metadata text-meta">
                      <Car className="size-3.5" aria-hidden /> Leave {clock(s.departLocal)} · about {s.driveMinutes} min drive
                    </p>
                  )}
                  <p className="font-sans text-body text-ink">
                    <span className="font-bold">
                      {clock(s.arriveLocal)}–{clock(s.leaveLocal)}
                    </span>{" "}
                    {s.name}
                    {s.personName ? ` (${s.personName}'s place)` : ""}
                  </p>
                  {s.address && <p className="font-sans text-metadata text-meta">{s.address}</p>}
                </li>
              ))}
            </ol>
            {proposal.homeUnknown && (
              <p className="font-sans text-metadata text-meta">
                I don&apos;t have your home address, so the first drive isn&apos;t counted. Add it in Settings for exact times.
              </p>
            )}
            <p className="font-sans text-metadata text-meta">Want something different? Just tell me (&ldquo;make Defy 90 minutes&rdquo;, &ldquo;skip Costco&rdquo;).</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeDrives} onChange={(e) => setIncludeDrives(e.target.checked)} />
              Also add the drives to my calendar
            </label>
            <Button className="self-start" disabled={saving} onClick={() => void confirm()}>
              {saving ? "Adding…" : "Add these to my calendar"}
            </Button>
          </CardContent>
        </Card>
      )}

      {created !== null && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="font-sans text-body text-ink">Done — {created} items added to your calendar.</p>
            <Button asChild className="self-start">
              <Link href="/calendar">Open calendar</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* pr-16 on phones keeps Send clear of the floating camera button. */}
      <form
        className="flex items-center gap-2 pr-16 md:pr-0"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input, messages);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={messages.length === 0 ? "e.g. Mermaid Cafe, then Defy, then Costco, then Dad's for dinner" : "Reply…"}
          disabled={pending}
          aria-label="Message"
          className="h-10 min-w-0 flex-1 rounded-input border border-line bg-surface px-3 font-sans text-body text-ink outline-none placeholder:text-meta focus-visible:ring-2 focus-visible:ring-action/50 disabled:opacity-50"
        />
        <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
      <div ref={endRef} />
    </div>
  );
}
