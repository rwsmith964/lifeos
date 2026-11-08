"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { rsvpAction } from "./actions";

type Status = "accepted" | "declined" | "maybe" | "pending";

export function RsvpButtons({ token, current }: { token: string; current: Status }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(status: "accepted" | "declined" | "maybe") {
    setPending(true);
    setError(null);
    const res = await rsvpAction(token, status);
    setPending(false);
    if (res.error) return setError(res.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} variant={current === "accepted" ? "default" : "outline"} onClick={() => void answer("accepted")}>
          I&apos;ll be there
        </Button>
        <Button disabled={pending} variant={current === "maybe" ? "default" : "outline"} onClick={() => void answer("maybe")}>
          Maybe
        </Button>
        <Button disabled={pending} variant={current === "declined" ? "default" : "outline"} onClick={() => void answer("declined")}>
          Can&apos;t make it
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
