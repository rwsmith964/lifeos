"use client";

import { Button } from "@/components/ui/button";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { respondToInvitationInAppAction } from "./invitation-actions";

export interface InvitationView {
  token: string;
  title: string;
  hostName: string;
  /** Pre-formatted on the server (calendar times are floating wall-clock values). */
  whenLabel: string;
  location: string | null;
  personalNote: string | null;
}

function useAnswer(token: string, status: "accepted" | "declined" | "maybe", message: string) {
  return useAsyncToastAction(
    async () => {
      const res = await respondToInvitationInAppAction(token, status);
      if (res.error) throw new Error(res.error);
    },
    { successMessage: message, errorMessage: "Couldn't save that" }
  );
}

function InvitationRow({ inv }: { inv: InvitationView }) {
  const accept = useAnswer(inv.token, "accepted", "Added to your calendar.");
  const maybe = useAnswer(inv.token, "maybe", "Marked as maybe.");
  const decline = useAnswer(inv.token, "declined", "Declined.");
  const busy = accept.pending || maybe.pending || decline.pending;

  return (
    <li className="flex flex-col gap-2 rounded-control border border-line bg-surface px-3 py-2">
      <div>
        <p className="font-sans text-body font-bold text-ink">{inv.title}</p>
        <p className="font-sans text-metadata text-meta">
          {inv.hostName} · {inv.whenLabel}
          {inv.location ? ` · ${inv.location}` : ""}
        </p>
        {inv.personalNote && <p className="font-sans text-metadata text-ink-2">A note for you: {inv.personalNote}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={accept.run}>
          Accept
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={maybe.run}>
          Maybe
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={decline.run}>
          Decline
        </Button>
      </div>
    </li>
  );
}

export function InvitationsCard({ invitations }: { invitations: InvitationView[] }) {
  if (invitations.length === 0) return null;
  return (
    <section aria-label="Invitations" className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
      <h2 className="font-sans text-body font-bold text-ink">
        You&apos;re invited{invitations.length > 1 ? ` (${invitations.length})` : ""}
      </h2>
      <ul className="flex flex-col gap-2">
        {invitations.map((inv) => (
          <InvitationRow key={inv.token} inv={inv} />
        ))}
      </ul>
    </section>
  );
}
