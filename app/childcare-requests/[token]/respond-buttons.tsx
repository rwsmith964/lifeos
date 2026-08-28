"use client";

import { useState, useTransition } from "react";
import { respondToChildcareRequestAction } from "./actions";
import { Button } from "@/components/ui/button";

export function RespondButtons({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"accepted" | "declined" | null>(null);

  function respond(response: "accepted" | "declined") {
    setError(null);
    startTransition(async () => {
      const result = await respondToChildcareRequestAction(token, response);
      if (result.error) {
        setError(result.error);
      } else {
        setStatus(result.status);
      }
    });
  }

  if (status === "accepted") {
    return <p className="text-sm font-medium text-green-700">You accepted — they&apos;ll see this in their plan.</p>;
  }
  if (status === "declined") {
    return <p className="text-sm font-medium">You declined this request.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button type="button" onClick={() => respond("accepted")} disabled={pending} className="flex-1">
          {pending ? "Submitting…" : "Accept"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => respond("declined")}
          disabled={pending}
          className="flex-1"
        >
          {pending ? "Submitting…" : "Decline"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
