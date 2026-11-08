"use client";

// "Connected people": link your household to someone else's (a brother-in-law,
// a girlfriend, a co-parent), choose what you share with each, or disconnect.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncToastAction } from "@/lib/hooks/use-async-toast-action";
import { disconnectLinkAction, revokeLinkInviteAction, sendLinkInviteAction, setLinkShareAction } from "./link-actions";

export interface ConnectionView {
  linkId: string;
  householdName: string;
  accountNames: string[];
  /** What MY household currently shares with them. */
  iShare: { busy_times: boolean; custody: boolean };
  /** What THEY share with me (read-only here). */
  theyShare: { busy_times: boolean; custody: boolean };
}

export interface PendingLinkInviteView {
  id: string;
  email: string;
  personName: string | null;
}

const SHARE_ROWS = [
  { key: "busy_times", label: "When I'm busy", hint: "Time ranges only — never event names or details." },
  { key: "custody", label: "When I have the kids", hint: "Time ranges only — no names or details." },
] as const;

function ShareToggle({ linkId, shareKey, label, hint, on }: { linkId: string; shareKey: "busy_times" | "custody"; label: string; hint: string; on: boolean }) {
  const toggle = useAsyncToastAction(
    async () => {
      const res = await setLinkShareAction(linkId, shareKey, !on);
      if (res.error) throw new Error(res.error);
    },
    { successMessage: on ? "No longer sharing that." : "Now sharing that.", errorMessage: "Couldn't save that" }
  );
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={on} disabled={toggle.pending} onChange={toggle.run} className="mt-1" />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function Connection({ c }: { c: ConnectionView }) {
  const disconnect = useAsyncToastAction(
    async () => {
      if (!window.confirm(`Disconnect from ${c.accountNames.join(", ") || c.householdName}? Sharing stops right away.`)) return;
      const res = await disconnectLinkAction(c.linkId);
      if (res.error) throw new Error(res.error);
    },
    { successMessage: "Disconnected.", errorMessage: "Couldn't disconnect" }
  );
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-sans text-body font-bold text-ink">{c.accountNames.join(" & ") || c.householdName}</p>
          <Button size="sm" variant="outline" disabled={disconnect.pending} onClick={disconnect.run}>
            Disconnect
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-sans text-metadata font-bold text-ink-2">What you share with them</p>
          {SHARE_ROWS.map((row) => (
            <ShareToggle key={row.key} linkId={c.linkId} shareKey={row.key} label={row.label} hint={row.hint} on={c.iShare[row.key]} />
          ))}
        </div>
        <div className="font-sans text-metadata text-meta">
          <p className="font-bold text-ink-2">What they share with you</p>
          {c.theyShare.busy_times || c.theyShare.custody ? (
            <ul className="list-disc pl-4">
              {c.theyShare.busy_times && <li>When they&apos;re busy</li>}
              {c.theyShare.custody && <li>When they have the kids</li>}
            </ul>
          ) : (
            <p>Nothing yet. They choose what to share.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PendingInvite({ invite }: { invite: PendingLinkInviteView }) {
  const revoke = useAsyncToastAction(
    async () => {
      const res = await revokeLinkInviteAction(invite.id);
      if (res.error) throw new Error(res.error);
    },
    { successMessage: "Invite revoked.", errorMessage: "Couldn't revoke that" }
  );
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>
        {invite.personName ? `${invite.personName} · ` : ""}
        {invite.email} <span className="text-muted-foreground">(waiting)</span>
      </span>
      <Button size="sm" variant="ghost" disabled={revoke.pending} onClick={revoke.run}>
        Revoke
      </Button>
    </li>
  );
}

function InviteForm({ people }: { people: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setSent(false);
    setFallbackUrl(null);
    if (!personId) return setError("Choose who to connect with.");
    setPending(true);
    const res = await sendLinkInviteAction({ personId, email });
    setPending(false);
    if (res.error) return setError(res.error);
    setSent(true);
    setFallbackUrl(res.inviteUrl ?? null);
    setEmail("");
    router.refresh();
  }

  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">Add someone in People first, then invite them to connect here.</p>;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-2">
        <Label htmlFor="link-person-select">Who</Label>
        <select
          id="link-person-select"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="link-email">Their email</Label>
        <Input id="link-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
      </div>
      <Button onClick={() => void submit()} disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </Button>
      <div className="sm:basis-full">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {sent && !fallbackUrl && <p className="text-sm text-muted-foreground">Invite sent.</p>}
        {fallbackUrl && (
          <p className="break-all text-sm text-muted-foreground">
            Email isn&apos;t set up here, so send them this link yourself: {fallbackUrl}
          </p>
        )}
      </div>
    </div>
  );
}

export function ConnectedPeople({
  connections,
  pending,
  invitablePeople,
  canManage,
}: {
  connections: ConnectionView[];
  pending: PendingLinkInviteView[];
  invitablePeople: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-sans text-body font-bold text-ink">Connected people</h2>
        <p className="font-sans text-metadata text-meta">
          Connect with someone who has their own LifeOS (a brother-in-law, a partner, a co-parent) to find times that work for both of
          you and send each other event invitations. You choose exactly what you share.
        </p>
      </div>
      {connections.map((c) => (
        <Connection key={c.linkId} c={c} />
      ))}
      {pending.length > 0 && (
        <ul className="flex flex-col gap-1">
          {pending.map((p) => (
            <PendingInvite key={p.id} invite={p} />
          ))}
        </ul>
      )}
      {canManage ? <InviteForm people={invitablePeople} /> : <p className="text-sm text-muted-foreground">Only owners and adults can connect households.</p>}
    </div>
  );
}
