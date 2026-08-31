import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import {
  listAttendeeNamesForEvents,
  listCustodyBlocksForHouseholdInRange,
  listEventsInRange,
} from "@/lib/db/repositories/calendar";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listWorkSchedulesForPeople, listTimeOffForPeopleInRange } from "@/lib/db/repositories/work-schedule";
import { getWeekendPlanForDate } from "@/lib/db/repositories/system";
import { listOpenOpportunitiesWithSubjectForHouseholdInDateRange } from "@/lib/db/repositories/opportunities";
import { getPresentedOpportunities } from "@/lib/opportunities/present";
import { birthdaysInRange, birthdayTitle } from "@/lib/calendar/birthdays";
import { workShiftsInRange, timeOffInRange, workShiftTitle, timeOffTitle } from "@/lib/calendar/work-schedule";
import { buildChildColorMap } from "@/lib/custody/colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RenderedMarkdown } from "@/components/ui/rendered-markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeleteCalendarItemButton } from "./delete-item-button";
import { Pencil } from "lucide-react";
import { GenerateWeekendPlanButton } from "./generate-weekend-plan-button";

const MONTH_PARAM_FORMAT = "yyyy-MM";
const DAY_PARAM_FORMAT = "yyyy-MM-dd";
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Human labels for the raw event_type / block_type enum values (Phase 3
// backlog: "raw enum chips shown unstyled" — these used to render via a
// bare `.replace(/_/g, " ")`, so e.g. "kid_activity" showed as the
// unstyled, lowercase "kid activity" chip instead of a proper label).
const EVENT_TYPE_LABELS: Record<string, string> = {
  personal: "Personal",
  work: "Work",
  family: "Family",
  custody: "Custody",
  kid_activity: "Kid activity",
  prep: "Prep",
  travel: "Travel",
  external: "Imported",
};
const BLOCK_TYPE_LABELS: Record<string, string> = {
  regular: "Regular",
  holiday: "Holiday",
  swap: "Swap",
  vacation: "Vacation",
};
const OTHER_CHIP_LABELS: Record<string, string> = {
  birthday: "Birthday",
  work_shift: "Work",
  time_off: "Time off",
};
function humanizeChipLabel(raw: string): string {
  return (
    EVENT_TYPE_LABELS[raw] ??
    BLOCK_TYPE_LABELS[raw] ??
    OTHER_CHIP_LABELS[raw] ??
    raw.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

function parseMonthParam(raw: string | undefined): Date {
  if (!raw) return startOfMonth(new Date());
  const parsed = parse(raw, MONTH_PARAM_FORMAT, new Date());
  return Number.isNaN(parsed.getTime()) ? startOfMonth(new Date()) : startOfMonth(parsed);
}

function parseDayParam(raw: string | undefined, monthDate: Date): Date {
  if (raw) {
    const parsed = parse(raw, DAY_PARAM_FORMAT, new Date());
    if (!Number.isNaN(parsed.getTime())) return startOfDay(parsed);
  }
  const today = startOfDay(new Date());
  return isSameMonth(today, monthDate) ? today : startOfMonth(monthDate);
}

// D-065: calendar granularity is a separate dimension from the existing
// All/Custody `view` filter -- "week" and "day" reuse the exact same
// month-grid markup and item-list below, just over a narrower window (see
// the gridStart/gridEnd branch below), so this stays a plain string union
// rather than a new enum/table -- there's no new data here, only a
// different slice of the same computed day items.
type CalendarRange = "month" | "week" | "day";

function parseRangeParam(raw: string | undefined): CalendarRange {
  return raw === "week" || raw === "day" ? raw : "month";
}

interface DayItem {
  id: string;
  kind: "event" | "custody" | "birthday" | "work_shift" | "time_off";
  startsAt: Date;
  endsAt: Date;
  title: string;
  subtitle: string;
  allDay: boolean;
  attendees: string[];
  location: string | null;
  dotClassName: string;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string; view?: string; range?: string }>;
}) {
  const { month: monthParam, day: dayParam, view: viewParam, range: rangeParam } = await searchParams;
  const { supabase, household } = await requireHouseholdContext();
  const view = viewParam === "custody" ? "custody" : "all";
  const range = parseRangeParam(rangeParam);

  const monthDate = parseMonthParam(monthParam);
  const selectedDay = parseDayParam(dayParam, monthDate);
  const monthLabel = format(monthDate, MONTH_PARAM_FORMAT);

  // D-065: month view's window is the full grid (including the leading/
  // trailing days of adjacent months needed to fill whole weeks), exactly
  // as before. Week and day views narrow this same window to just the
  // selected day's week or the selected day itself -- every downstream
  // consumer below (event/custody/work-schedule queries, birthdaysInRange,
  // the byDay grouping) already operates purely off gridStart/gridEnd/
  // gridDays, so narrowing these three is the entire behavior change;
  // nothing past this block needs to know which range is active.
  const gridStart =
    range === "day" ? startOfDay(selectedDay) : range === "week" ? startOfWeek(selectedDay) : startOfWeek(startOfMonth(monthDate));
  // D-066 fix: Day view's gridEnd was previously startOfDay(selectedDay)
  // -- identical to gridStart -- making it a zero-width instant. Every
  // range query below builds a half-open [gridStart, gridEnd) window
  // (see listEventsInRange's .gte/.lt pair), so a zero-width window
  // always matched nothing: Day view could never show a single calendar
  // event, no matter what was actually on that day. Live-verifying the
  // new brain-dump feature (D-066) is what surfaced this -- a calendar
  // event it created showed a "Saved" badge (the row really was written)
  // but never appeared on the day it was created for. Using endOfDay
  // matches the exact convention endOfWeek/endOfMonth already use for
  // week/month (end of the *last* day, not start of the day after), so
  // this is the same half-open-with-inclusive-last-moment pattern applied
  // consistently across all three ranges rather than a new one.
  const gridEnd =
    range === "day" ? endOfDay(selectedDay) : range === "week" ? endOfWeek(selectedDay) : endOfWeek(endOfMonth(monthDate));
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const [events, custodyBlocks, people] = await Promise.all([
    listEventsInRange(supabase, household.id, gridStart.toISOString(), gridEnd.toISOString()),
    listCustodyBlocksForHouseholdInRange(supabase, household.id, gridStart.toISOString(), gridEnd.toISOString()),
    listPeopleForHousehold(supabase, household.id),
  ]);
  // D-068: only expand shifts/time-off for people who've opted into the
  // main calendar (defaults false for everyone but self — see migration
  // 20260829000001). The custody calendar's co-parent-schedule section
  // intentionally bypasses this filter; this one is specific to /calendar.
  const calendarSchedulePersonIds = people.filter((p) => p.show_work_schedule_on_calendar).map((p) => p.id);
  const [workSchedules, timeOffEntries] = await Promise.all([
    listWorkSchedulesForPeople(supabase, calendarSchedulePersonIds),
    listTimeOffForPeopleInRange(
      supabase,
      calendarSchedulePersonIds,
      format(gridStart, DAY_PARAM_FORMAT),
      format(gridEnd, DAY_PARAM_FORMAT)
    ),
  ]);
  const attendeesByEvent = await listAttendeeNamesForEvents(
    supabase,
    events.map((e) => e.id)
  );

  const peopleById = new Map(people.map((p) => [p.id, p.nickname || p.full_name]));
  const childColors = buildChildColorMap(people.filter((p) => p.relationship_type === "child").map((p) => p.id));
  const defaultChildColor = { dot: "bg-primary", badge: "bg-muted text-foreground" };

  const eventItems: DayItem[] = events.map((e) => ({
    id: e.id,
    kind: "event",
    startsAt: new Date(e.starts_at),
    endsAt: new Date(e.ends_at),
    title: e.title,
    subtitle: e.event_type,
    allDay: e.all_day,
    attendees: attendeesByEvent.get(e.id) ?? [],
    location: e.location,
    dotClassName: "bg-primary",
  }));

  const custodyItems: DayItem[] = custodyBlocks.map((c) => {
    const color = childColors.get(c.child_person_id) ?? defaultChildColor;
    const childName = peopleById.get(c.child_person_id) ?? "Someone";
    const responsibleName = peopleById.get(c.responsible_person_id) ?? "Unknown";
    return {
      id: c.id,
      kind: "custody",
      startsAt: new Date(c.starts_at),
      endsAt: new Date(c.ends_at),
      title: `${childName} with ${responsibleName}`,
      subtitle: c.block_type,
      allDay: false,
      attendees: [],
      location: c.location,
      dotClassName: color.dot,
    };
  });

  // D-062: birthdays auto-populate on the calendar, computed fresh from
  // each person's birthdate rather than stored as their own events — see
  // lib/calendar/birthdays.ts for why. Shown alongside real events, not
  // in the custody-only view (custody view is specifically about
  // who-has-the-kids, not general household occasions).
  const birthdayItems: DayItem[] = birthdaysInRange(people, gridStart, gridEnd).map((b) => ({
    id: `birthday-${b.personId}-${format(b.date, DAY_PARAM_FORMAT)}`,
    kind: "birthday",
    startsAt: b.date,
    endsAt: b.date,
    title: birthdayTitle(b),
    subtitle: "birthday",
    allDay: true,
    attendees: [],
    location: null,
    dotClassName: "bg-pink-500",
  }));

  // D-064: work shifts are computed the same way birthdays are — expanded
  // fresh from each person's weekly work_schedules rows for the visible
  // range, never stored as individual dated rows (see
  // lib/calendar/work-schedule.ts). Time off entries ARE real dated rows,
  // so they're fetched directly and expanded per-day the same way the
  // shifts are, purely so both share one merge/sort/group pipeline below.
  // Neither belongs in the custody-only view, same reasoning as birthdays.
  // Raw DB/schedule ids are reused as the DayItem id even though a single
  // work_schedules row (weekly recurring) or time_off_entries row
  // (multi-day span) produces one item per matching calendar day — same
  // precedent as custody blocks above, which also keep one shared id
  // across every day they span. Safe because each day's list is a
  // separate bucket in `byDay`, so ids only need to be unique within a
  // single day's rendered list, not globally.
  const workShiftItems: DayItem[] = workShiftsInRange(workSchedules, timeOffEntries, people, gridStart, gridEnd).map((s) => ({
    id: s.scheduleId,
    kind: "work_shift",
    startsAt: s.date,
    endsAt: s.date,
    title: workShiftTitle(s),
    subtitle: "work_shift",
    allDay: false,
    attendees: [],
    location: null,
    dotClassName: "bg-slate-400",
  }));

  const timeOffItems: DayItem[] = timeOffInRange(timeOffEntries, people, gridStart, gridEnd).map((t) => ({
    id: t.entryId,
    kind: "time_off",
    startsAt: t.date,
    endsAt: t.date,
    title: timeOffTitle(t),
    subtitle: "time_off",
    allDay: true,
    attendees: [],
    location: null,
    dotClassName: "bg-amber-500",
  }));

  const items =
    view === "custody"
      ? custodyItems
      : [...eventItems, ...custodyItems, ...birthdayItems, ...workShiftItems, ...timeOffItems].sort(
          (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
        );

  // A block/event is a span, not a point — index it under every calendar
  // day it covers, not just the day it starts. Missing this was why a
  // multi-day custody block only showed on its first day (round-2 D-033,
  // brief 2.1) — the underlying query fix is in
  // lib/db/repositories/calendar.ts; this is the display-side half.
  const byDay = new Map<string, DayItem[]>();
  for (const item of items) {
    const spanEnd = item.endsAt > item.startsAt ? item.endsAt : item.startsAt;
    for (const day of eachDayOfInterval({ start: startOfDay(item.startsAt), end: startOfDay(spanEnd) })) {
      if (day < gridStart || day > gridEnd) continue;
      const key = format(day, DAY_PARAM_FORMAT);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
  }

  const selectedDayKey = format(selectedDay, DAY_PARAM_FORMAT);
  const selectedDayItems = byDay.get(selectedDayKey) ?? [];

  const viewQuery = view === "custody" ? "&view=custody" : "";
  const rangeQuery = range !== "month" ? `&range=${range}` : "";

  // D-065: prev/next semantics differ by granularity, mirroring how each
  // range's own natural unit works -- month nav shifts the month (day
  // selection resets via parseDayParam's existing "today if in view, else
  // the 1st" fallback, unchanged from before this feature), while week/day
  // nav shifts the anchor day itself by exactly 7 or 1 days, carrying the
  // `month` param along so it stays in sync if the user switches back to
  // month view mid-navigation.
  let headerTitle: string;
  let prevMonthHref: string;
  let nextMonthHref: string;
  if (range === "day") {
    const prevDay = subDays(selectedDay, 1);
    const nextDay = addDays(selectedDay, 1);
    headerTitle = format(selectedDay, "EEEE, MMMM d, yyyy");
    prevMonthHref = `/calendar?month=${format(prevDay, MONTH_PARAM_FORMAT)}&day=${format(prevDay, DAY_PARAM_FORMAT)}${viewQuery}${rangeQuery}`;
    nextMonthHref = `/calendar?month=${format(nextDay, MONTH_PARAM_FORMAT)}&day=${format(nextDay, DAY_PARAM_FORMAT)}${viewQuery}${rangeQuery}`;
  } else if (range === "week") {
    const prevWeekAnchor = subWeeks(selectedDay, 1);
    const nextWeekAnchor = addWeeks(selectedDay, 1);
    headerTitle = `${format(gridStart, "MMM d")} \u2013 ${format(gridEnd, "MMM d, yyyy")}`;
    prevMonthHref = `/calendar?month=${format(prevWeekAnchor, MONTH_PARAM_FORMAT)}&day=${format(prevWeekAnchor, DAY_PARAM_FORMAT)}${viewQuery}${rangeQuery}`;
    nextMonthHref = `/calendar?month=${format(nextWeekAnchor, MONTH_PARAM_FORMAT)}&day=${format(nextWeekAnchor, DAY_PARAM_FORMAT)}${viewQuery}${rangeQuery}`;
  } else {
    headerTitle = format(monthDate, "MMMM yyyy");
    prevMonthHref = `/calendar?month=${format(subMonths(monthDate, 1), MONTH_PARAM_FORMAT)}${viewQuery}`;
    nextMonthHref = `/calendar?month=${format(addMonths(monthDate, 1), MONTH_PARAM_FORMAT)}${viewQuery}`;
  }

  const today = startOfDay(new Date());
  const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
  // "This weekend" means the Saturday still ahead of (or today, if today
  // IS Saturday) the current day — not next Saturday when today already
  // is one (round-2 brief 3.1: hard-coded phrasing reading wrong on a
  // weekend).
  const upcomingSaturday = format(new Date(today.getTime() + daysUntilSaturday * 86400000), DAY_PARAM_FORMAT);
  const upcomingSunday = format(new Date(today.getTime() + (daysUntilSaturday + 1) * 86400000), DAY_PARAM_FORMAT);
  const weekendLabel = daysUntilSaturday === 0 ? "This weekend" : `This weekend (${format(new Date(upcomingSaturday), "MMM d")})`;
  const weekendPlan = await getWeekendPlanForDate(supabase, household.id, upcomingSaturday);
  // D-061: surface a nudge here (in addition to the Opportunities page and
  // Brief card) when a detected opportunity falls within the same
  // Saturday/Sunday window this card already computes.
  const rawWeekendOpportunities = await listOpenOpportunitiesWithSubjectForHouseholdInDateRange(
    supabase,
    household.id,
    upcomingSaturday,
    upcomingSunday
  );
  // P1-6/D-070: same threshold/dedupe/tiering the Opportunities page and
  // Brief card use, scoped to just this weekend's window.
  const weekendOpportunities = getPresentedOpportunities(rawWeekendOpportunities).flat;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* D-079 (P2-4): dropped the standalone header "Custody" button --
          with the All/Custody filter toggle right below also saying
          "Custody", the header read as three overlapping controls. Custody
          schedule management is still one tap away via "Manage schedules"
          inside the Custody filter view itself (below). */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <div className="flex gap-2">
          <Button asChild size="sm">
            {/* D-079 (P2-3): prefill from whichever day is currently
                selected, matching the empty-state "Add something" link
                below -- previously always opened blank regardless of the
                day the user had just clicked. */}
            <Link href={`/calendar/new?date=${selectedDayKey}`}>
              <Plus className="size-4" /> Add
            </Link>
          </Button>
        </div>
      </div>

      {/* D-065: granularity (Month/Week/Day) is a separate control from
          the All/Custody filter row below it -- the two combine freely
          (e.g. Custody + Week), so this is its own segmented control
          rather than folded into the existing toggle. */}
      <div className="flex gap-1 rounded-md bg-muted p-1 text-sm">
        <Link
          href={`/calendar?month=${monthLabel}&day=${selectedDayKey}${viewQuery}`}
          className={cn("flex-1 rounded px-3 py-1.5 text-center", range === "month" ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
        >
          Month
        </Link>
        <Link
          href={`/calendar?month=${monthLabel}&day=${selectedDayKey}${viewQuery}&range=week`}
          className={cn("flex-1 rounded px-3 py-1.5 text-center", range === "week" ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
        >
          Week
        </Link>
        <Link
          href={`/calendar?month=${monthLabel}&day=${selectedDayKey}${viewQuery}&range=day`}
          className={cn("flex-1 rounded px-3 py-1.5 text-center", range === "day" ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
        >
          Day
        </Link>
      </div>

      <div className="flex gap-1 rounded-md bg-muted p-1 text-sm">
        <Link
          href={`/calendar?month=${monthLabel}&day=${selectedDayKey}${rangeQuery}`}
          className={cn("flex-1 rounded px-3 py-1.5 text-center", view === "all" ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
        >
          All
        </Link>
        <Link
          href={`/calendar?month=${monthLabel}&day=${selectedDayKey}&view=custody${rangeQuery}`}
          className={cn("flex-1 rounded px-3 py-1.5 text-center", view === "custody" ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
        >
          Custody
        </Link>
      </div>

      {view === "custody" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            {[...childColors.entries()].map(([childId, color]) => (
              <div key={childId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", color.dot)} />
                {peopleById.get(childId) ?? "Child"}
              </div>
            ))}
          </div>
          <Link href="/calendar/custody" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Manage schedules
          </Link>
        </div>
      )}

      {/* D-079 (P2-4): the AI weekend-plan narrative could run ~400px tall,
          burying the month grid below the fold on every visit. A native
          <details> starts closed by default with zero extra client JS --
          the plan is one tap away instead of forced screen real estate. */}
      {view === "all" && (
        <details className="group bg-card text-card-foreground rounded-xl border shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            {weekendLabel}
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {weekendPlan ? (
              <>
                <RenderedMarkdown content={weekendPlan.content_markdown} className="flex flex-col gap-1.5 text-sm text-muted-foreground" />
                <div>
                  <GenerateWeekendPlanButton variant="regenerate" />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">No plan generated yet.</p>
                <GenerateWeekendPlanButton />
              </>
            )}
            {weekendOpportunities.length > 0 && (
              <div className="flex flex-col gap-1 rounded-md border border-dashed p-2">
                {weekendOpportunities.slice(0, 2).map((opp) => (
                  <p key={opp.id} className="text-sm">
                    <span className="font-medium">{opp.headline}</span>
                  </p>
                ))}
                <Link href="/opportunities" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  See opportunities
                </Link>
              </div>
            )}
          </div>
        </details>
      )}

      {/* D-065: day range skips the grid entirely -- with only one day in
          the window there's nothing a grid adds over the header itself, so
          the Card below renders just the prev/title/next row and the
          selected-day agenda list underneath does all the work. Week range
          reuses this exact same grid markup unmodified: gridDays is just a
          7-element array in that case, which grid-cols-7 renders as a
          single row for free. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <Button asChild size="icon" variant="ghost" className="size-7" aria-label={`Previous ${range}`}>
            <Link href={prevMonthHref}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <CardTitle className="text-sm">{headerTitle}</CardTitle>
          <Button asChild size="icon" variant="ghost" className="size-7" aria-label={`Next ${range}`}>
            <Link href={nextMonthHref}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        {range !== "day" && (
          <CardContent className="flex flex-col gap-1">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((day) => {
                const key = format(day, DAY_PARAM_FORMAT);
                const dayItems = byDay.get(key) ?? [];
                // Month view dims leading/trailing days from adjacent
                // months that only exist to fill out the grid shape. Week
                // view has no such filler days -- every cell is a real day
                // in the current week even when the week crosses a month
                // boundary, so none of them should read as "out of range".
                const inMonth = range === "week" ? true : isSameMonth(day, monthDate);
                const selected = isSameDay(day, selectedDay);
                return (
                  <Link
                    key={key}
                    // The #selected-day fragment makes next/link scroll the
                    // matching-id element into view instead of resetting to
                    // the top of the page — without it, picking a day left
                    // you looking at the month grid with the newly selected
                    // day's events still off-screen below it (Phase 3
                    // backlog: "no auto-scroll").
                    href={`/calendar?month=${monthLabel}&day=${key}${viewQuery}${rangeQuery}#selected-day`}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-md py-1.5 text-xs",
                      inMonth ? "text-foreground" : "text-muted-foreground/40",
                      selected && "bg-primary text-primary-foreground",
                      !selected && isToday(day) && "font-semibold text-primary"
                    )}
                  >
                    <span>{format(day, "d")}</span>
                    <span className="flex h-1.5 items-center gap-0.5">
                      {dayItems.slice(0, 3).map((item, i) => (
                        <span
                          key={i}
                          className={cn("size-1 rounded-full", selected ? "bg-primary-foreground" : item.dotClassName)}
                        />
                      ))}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      <div id="selected-day" className="flex flex-col gap-2 scroll-mt-4">
        {range !== "day" && <p className="text-xs font-medium text-muted-foreground">{format(selectedDay, "EEEE, MMMM d")}</p>}
        {selectedDayItems.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              Nothing scheduled.{" "}
              <Link href={`/calendar/new?date=${selectedDayKey}`} className="underline underline-offset-2">
                Add something
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          selectedDayItems.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.allDay ? "All day" : format(item.startsAt, "h:mm a")}
                    {item.attendees.length > 0 && ` · ${item.attendees.join(", ")}`}
                    {item.location && (
                      <span className="inline-flex items-center gap-0.5">
                        {" "}
                        · <MapPin className="size-3" /> {item.location}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{humanizeChipLabel(item.subtitle)}</Badge>
                  {item.kind === "event" && (
                    <Button asChild size="icon" variant="ghost" className="size-8">
                      <Link href={`/calendar/${item.id}/edit`} aria-label="Edit event">
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                  )}
                  {(item.kind === "event" || item.kind === "custody" || item.kind === "time_off") && (
                    <DeleteCalendarItemButton id={item.id} kind={item.kind} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
