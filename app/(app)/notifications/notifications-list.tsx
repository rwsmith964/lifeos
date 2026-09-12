"use client";

// F4 (audit pass 2026-09-11): "Notifications renders ~40 briefings in one
// page back to 16 days, each several paragraphs, all expanded, no
// grouping, no paging, no unread filter. Group by day, collapse read items
// to a one-line summary, add an unread filter, page after the first
// week." All four addressed here: day-grouped sections, an All/Unread
// segmented filter, a read notification collapses to its title + relative
// time (click to expand the body back open), and only the first 7 days of
// groups render until "Show older" is clicked.
import { useMemo, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow, isToday, isYesterday, startOfDay, subDays } from "date-fns";
import type { NotificationRow } from "@/lib/db/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { RenderedMarkdown } from "@/components/ui/rendered-markdown";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { MarkReadButton } from "./notification-actions";

function stripDuplicateHeading(body: string, title: string): string {
  const lines = body.split("\n");
  if (lines[0]?.trim().toLowerCase() === `## ${title.trim().toLowerCase()}`) {
    return lines.slice(1).join("\n").replace(/^\n+/, "");
  }
  return body;
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

function NotificationRowItem({ notification }: { notification: NotificationRow }) {
  const [expanded, setExpanded] = useState(false);
  const isUnread = !notification.read_at;
  const body = stripDuplicateHeading(notification.body, notification.title);
  const timeLabel = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  const card = (
    <Card className={isUnread ? "border-primary" : undefined}>
      <CardContent className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isUnread || expanded ? (
            <>
              <p className="text-sm font-medium">{notification.title}</p>
              <RenderedMarkdown content={body} className="text-xs text-muted-foreground [&>p]:mt-1 first:[&>p]:mt-0" />
            </>
          ) : (
            // Read notifications collapse to one line -- title + relative
            // time only, since the full multi-paragraph body already did
            // its job once. Tapping it (via the button below) re-expands.
            <p className="truncate text-sm text-muted-foreground">{notification.title}</p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">{timeLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isUnread && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
            >
              {expanded ? "Collapse" : "Expand"}
            </Button>
          )}
          {isUnread && <MarkReadButton notificationId={notification.id} />}
        </div>
      </CardContent>
    </Card>
  );

  return notification.link_path ? <Link href={notification.link_path}>{card}</Link> : card;
}

const INITIAL_DAY_WINDOW = 7;

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [showOlder, setShowOlder] = useState(false);

  const filtered = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => !n.read_at) : notifications),
    [notifications, filter]
  );

  const groups = useMemo(() => {
    const byDay = new Map<string, { date: Date; items: NotificationRow[] }>();
    for (const n of filtered) {
      const date = startOfDay(new Date(n.created_at));
      const key = format(date, "yyyy-MM-dd");
      const group = byDay.get(key);
      if (group) group.items.push(n);
      else byDay.set(key, { date, items: [n] });
    }
    return [...byDay.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filtered]);

  const cutoff = subDays(startOfDay(new Date()), INITIAL_DAY_WINDOW);
  const recentGroups = groups.filter((g) => g.date >= cutoff);
  const olderGroups = groups.filter((g) => g.date < cutoff);
  const visibleGroups = showOlder ? groups : recentGroups;

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        aria-label="Filter notifications"
        options={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {visibleGroups.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            {filter === "unread"
              ? "Nothing unread."
              : "Nothing yet — gift reminders and daily briefs will show up here."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {visibleGroups.map((group) => (
            <div key={group.date.toISOString()} className="flex flex-col gap-2">
              <h2 className="font-sans text-metadata font-bold uppercase text-meta">{dayLabel(group.date)}</h2>
              <div className="flex flex-col gap-2">
                {group.items.map((n) => (
                  <NotificationRowItem key={n.id} notification={n} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!showOlder && olderGroups.length > 0 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowOlder(true)}>
          Show older ({olderGroups.reduce((sum, g) => sum + g.items.length, 0)})
        </Button>
      )}
    </div>
  );
}
