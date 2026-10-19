"use client";

// "I reached out to <person>" -- one control for both the Today reach-out
// tile (compact: one tap, logs a text today) and the person profile (full:
// pick how and when, for the "I texted them yesterday" case). Both go
// through logContactAction so they can't behave differently, and both give
// the same feedback: a success toast with a working Undo, or an error toast
// with Retry. The old profile button gave neither -- a failed save and a
// successful one looked identical.
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { logContactAction, undoLogContactAction } from "@/app/(app)/contact-actions";
import type { ContactType } from "@/lib/db/database.types";
import type { LogContactResult } from "@/lib/contact/log-contact";

const TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: "text", label: "Texted" },
  { value: "call", label: "Called" },
  { value: "in_person", label: "Saw in person" },
  { value: "other", label: "Other" },
];

export function LogContactControl({
  personId,
  personName,
  variant,
  maxDate,
}: {
  personId: string;
  personName: string;
  variant: "compact" | "full";
  /** YYYY-MM-DD, household-local today -- the date input's max. Only used by the full variant. */
  maxDate?: string;
}) {
  const [type, setType] = useState<ContactType>("text");
  const [occurredOn, setOccurredOn] = useState("");
  const lastResult = useRef<LogContactResult | null>(null);

  const log = useAsyncToastAction(
    async () => {
      const result = await logContactAction(personId, type, occurredOn || null);
      if (result.error) throw new Error(result.error);
      lastResult.current = result;
    },
    {
      successMessage: `Logged contact with ${personName}.`,
      errorMessage: "Couldn't log that contact",
      undoMessage: "Contact removed.",
      onUndo: async () => {
        const logged = lastResult.current;
        if (!logged?.interactionId) throw new Error("Nothing to undo.");
        const result = await undoLogContactAction(
          personId,
          logged.interactionId,
          logged.previousLastContactDate ?? null,
          logged.previousLastContactType ?? null
        );
        if (result.error) throw new Error(result.error);
      },
    }
  );

  if (variant === "compact") {
    return (
      <Button variant="outline" size="sm" disabled={log.pending} onClick={log.run}>
        {log.pending ? "Logging…" : "Log contact"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="How you got in touch"
        value={type}
        onChange={(e) => setType(e.target.value as ContactType)}
        className="border-input h-control-touch rounded-md border bg-transparent px-2 text-sm md:h-8"
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Input
        type="date"
        aria-label="Date of contact (leave blank for today)"
        value={occurredOn}
        max={maxDate}
        onChange={(e) => setOccurredOn(e.target.value)}
        className="h-control-touch w-40 md:h-8"
      />
      <Button size="sm" variant="outline" disabled={log.pending} onClick={log.run}>
        {log.pending ? "Logging…" : "Log contact"}
      </Button>
    </div>
  );
}
