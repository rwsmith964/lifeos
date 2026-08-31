"use client";

import { useActionState, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  addCalendarFeedAction,
  deleteCalendarFeedAction,
  syncCalendarFeedNowAction,
  type CalendarFeedFormState,
} from "./calendar-feed-actions";
import type { CalendarFeedRow } from "@/lib/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";

// Kept as a plain object here rather than in calendar-feed-actions.ts --
// same "use server" export-shape rule as household-invite-actions.ts's
// initialInviteState (see that file's comment; a real object constant in
// a "use server" module throws at evaluation time).
const initialAddState: CalendarFeedFormState = { error: null, added: false };

const statusLabel: Record<CalendarFeedRow["last_sync_status"], string> = {
  never: "Not synced yet",
  ok: "Synced",
  error: "Sync failed",
};

const statusBadgeVariant: Record<CalendarFeedRow["last_sync_status"], "default" | "secondary" | "destructive"> = {
  never: "secondary",
  ok: "default",
  error: "destructive",
};

function AddFeedForm() {
  const [state, dispatch, pending] = useActionState(addCalendarFeedAction, initialAddState);

  return (
    <form action={dispatch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="feed-label">Name</Label>
        <Input id="feed-label" name="label" placeholder="e.g. Mel's Google Calendar" required maxLength={80} />
      </div>
      <div className="flex flex-[2] flex-col gap-2">
        <Label htmlFor="feed-url">Calendar URL</Label>
        <Input
          id="feed-url"
          name="feed_url"
          type="url"
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          required
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add calendar"}
      </Button>
      {state.error && <p className="text-sm text-destructive sm:basis-full">{state.error}</p>}
      {state.added && !state.error && (
        <p className="text-sm text-muted-foreground sm:basis-full">Calendar connected and synced.</p>
      )}
    </form>
  );
}

function SyncNowButton({ feedId }: { feedId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await syncCalendarFeedNowAction(feedId);
          setError(result.error);
          setPending(false);
        }}
      >
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function RemoveFeedButton({ feedId, label }: { feedId: string; label: string }) {
  return (
    <ConfirmDeleteButton
      label="Remove"
      confirmLabel="Remove"
      dialogTitle={`Remove "${label}"?`}
      dialogDescription="This disconnects the calendar and deletes every event it imported. Your own events aren't affected."
      successMessage="Calendar removed."
      size="sm"
      action={() => deleteCalendarFeedAction(feedId)}
    />
  );
}

function lastSyncedLabel(feed: CalendarFeedRow): string {
  if (!feed.last_synced_at) return "Never synced";
  return `Synced ${formatDistanceToNow(new Date(feed.last_synced_at), { addSuffix: true })}`;
}

export function CalendarFeeds({ feeds, canManage }: { feeds: CalendarFeedRow[]; canManage: boolean }) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Connected calendars</Label>
            <p className="text-xs text-muted-foreground">
              Import events from Google Calendar or any other calendar that offers an iCal (.ics) link, so the
              weekend planner knows about your real commitments.
            </p>
          </div>
          {canManage && !showAddForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
              Add a calendar
            </Button>
          )}
        </div>

        {canManage && showAddForm && <AddFeedForm />}

        {feeds.length === 0 && (
          <p className="text-sm text-muted-foreground">No calendars connected yet.</p>
        )}

        <ul className="flex flex-col gap-2">
          {feeds.map((feed) => (
            <li key={feed.id} className="flex items-center justify-between gap-2 border-t pt-3 text-sm first:border-t-0 first:pt-0">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{feed.label}</span>
                  <Badge variant={statusBadgeVariant[feed.last_sync_status]}>
                    {statusLabel[feed.last_sync_status]}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">{lastSyncedLabel(feed)}</span>
                {feed.last_sync_status === "error" && feed.last_sync_error && (
                  <span className="text-xs text-destructive">{feed.last_sync_error}</span>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <SyncNowButton feedId={feed.id} />
                  <RemoveFeedButton feedId={feed.id} label={feed.label} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
