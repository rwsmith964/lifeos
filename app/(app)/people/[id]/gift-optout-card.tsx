"use client";

import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { setGiftsEnabledAction } from "./gift-optout-actions";

export function GiftOptOutCard({ personId, name, giftsEnabled }: { personId: string; name: string; giftsEnabled: boolean }) {
  const toggle = useAsyncToastAction(
    async () => {
      const res = await setGiftsEnabledAction(personId, !giftsEnabled);
      if (res.error) throw new Error(res.error);
    },
    {
      successMessage: giftsEnabled ? `No more gift reminders for ${name}.` : `Gift reminders are back on for ${name}.`,
      errorMessage: "Couldn't save that",
    }
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Gift className="mt-0.5 size-4 shrink-0 text-meta" aria-hidden />
          <div>
            <p className="font-sans text-body font-bold text-ink">
              {giftsEnabled ? `Gifts for ${name}` : `We don't get gifts for ${name}`}
            </p>
            <p className="font-sans text-metadata text-meta">
              {giftsEnabled
                ? "Birthday and holiday gift reminders are on."
                : "No gift reminders, suggestions or “Start gift” buttons. Past gifts stay in the history."}
            </p>
          </div>
        </div>
        <Button size="sm" variant={giftsEnabled ? "outline" : "default"} disabled={toggle.pending} onClick={toggle.run}>
          {giftsEnabled ? "We don't get gifts for them" : "Start gift reminders again"}
        </Button>
      </CardContent>
    </Card>
  );
}
