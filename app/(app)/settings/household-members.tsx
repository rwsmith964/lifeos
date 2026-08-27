"use client";

import { useActionState, useState } from "react";
import {
  leaveHouseholdAction,
  removeMemberAction,
  revokeHouseholdInviteAction,
  sendHouseholdInviteAction,
  type HouseholdInviteFormState,
} from "./household-invite-actions";
import type { HouseholdInviteRow, HouseholdRole } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { useConfirmDelete } from "@/lib/hooks/use-confirm-delete";

// Kept here rather than in household-invite-actions.ts: a "use server" file
// may only export async functions at runtime (type-only exports like
// HouseholdInviteFormState are fine since they're erased at compile time,
// but a real object constant like this one is not) — Next.js throws
// "A 'use server' file can only export async functions, found object" the
// moment that module is evaluated. Found live via production verification
// (D-055 follow-up): every invite-send attempt 500'd because of this.
const initialInviteState: HouseholdInviteFormState = { error: null, sent: false };

export interface HouseholdMemberDisplay {
  memberId: string;
  userId: string;
  displayName: string;
  role: HouseholdRole;
  isSelf: boolean;
}

const roleLabel: Record<HouseholdRole, string> = {
  owner: "Owner",
  adult: "Adult",
  child: "Child",
  viewer: "Viewer",
};

const roleBadgeVariant: Record<HouseholdRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  adult: "secondary",
  child: "outline",
  viewer: "outline",
};

function InviteForm() {
  const [state, dispatch, pending] = useActionState(sendHouseholdInviteAction, initialInviteState);

  return (
    <form action={dispatch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="invite-email">Email address</Label>
        <Input id="invite-email" name="email" type="email" placeholder="name@example.com" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="adult"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="adult">Adult — full access</option>
          <option value="viewer">Viewer — read only</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </Button>
      {state.error && <p className="text-sm text-destructive sm:basis-full">{state.error}</p>}
      {state.sent && !state.error && (
        <p className="text-sm text-muted-foreground sm:basis-full">Invite sent.</p>
      )}
    </form>
  );
}

function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const { armed, pending, error, trigger, cancel } = useConfirmDelete(async () => {
    const result = await revokeHouseholdInviteAction(inviteId);
    if (result.error) throw new Error(result.error);
  });
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" variant={armed ? "destructive" : "ghost"} disabled={pending} onClick={trigger}>
          {pending ? "Revoking…" : armed ? "Confirm revoke" : "Revoke"}
        </Button>
        {armed && !pending && (
          <Button type="button" size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function LeaveHouseholdButton() {
  return (
    <ConfirmDeleteButton
      action={leaveHouseholdAction}
      label="Leave household"
      confirmLabel="Confirm leave"
      size="sm"
    />
  );
}

export function HouseholdMembers({
  members,
  invites,
  canManage,
  currentUserId,
}: {
  members: HouseholdMemberDisplay[];
  invites: HouseholdInviteRow[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const pendingInvites = invites.filter((i) => i.status === "pending");
  const pastInvites = invites.filter((i) => i.status !== "pending");
  const self = members.find((m) => m.userId === currentUserId);
  const canLeave = self && self.role !== "owner";

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label>Household members</Label>
          {canManage && !showInviteForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowInviteForm(true)}>
              Invite someone
            </Button>
          )}
        </div>

        {canManage && showInviteForm && <InviteForm />}

        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.memberId} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span>
                  {member.displayName}
                  {member.isSelf && <span className="text-muted-foreground"> (you)</span>}
                </span>
                <Badge variant={roleBadgeVariant[member.role]}>{roleLabel[member.role]}</Badge>
              </span>
              {canManage && member.role !== "owner" && !member.isSelf && (
                <RemoveMemberButton memberId={member.memberId} />
              )}
            </li>
          ))}
        </ul>

        {pendingInvites.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <Label>Pending invites</Label>
            <ul className="flex flex-col gap-2">
              {pendingInvites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span>{invite.invited_email}</span>
                    <Badge variant="outline">{roleLabel[invite.role]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      expires {new Date(invite.expires_at).toLocaleDateString()}
                    </span>
                  </span>
                  {canManage && <RevokeInviteButton inviteId={invite.id} />}
                </li>
              ))}
            </ul>
          </div>
        )}

        {pastInvites.length > 0 && (
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer select-none">Invite history</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {pastInvites.map((invite) => (
                <li key={invite.id}>
                  {invite.invited_email} — {invite.status}
                </li>
              ))}
            </ul>
          </details>
        )}

        {canLeave && (
          <div className="flex justify-end border-t pt-3">
            <LeaveHouseholdButton />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RemoveMemberButton({ memberId }: { memberId: string }) {
  return (
    <ConfirmDeleteButton
      action={() => removeMemberAction(memberId)}
      label="Remove"
      size="sm"
    />
  );
}
