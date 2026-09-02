import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, MapPin, Plus, TriangleAlert } from "lucide-react";
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
  listAttendeesForEvents,
  listCustodyBlocksForHouseholdInRange,
  listEventsInRange,
} from "@/lib/db/repositories/calendar";
import { isKidLinkedEventVisibleForViewer } from "@/lib/custody/visibility";
import { listPeopleForHousehold, peopleRepo } from "@/lib/db/repositories/people";
import { usersRepo } from "@/lib/db/repositories/households";
import { isFeatureEnabled } from "@/lib/flags";
import { detectScheduleConflictsForHousehold, resolveTravelLegsForHousehold } from "@/lib/scheduling/detect-conflicts";
import type { TravelConflictWarning } from "@/lib/scheduling/travel-conflicts";
import { buildDayTimeline, type DayTimelineItemLike, type DayTimelineTravelLeg } from "@/lib/calendar/day-timeline";
import { listWorkSchedulesForPeople, listTimeOffForPeopleInRange } from "@/lib/db/repositories/work-schedule";
import { getWeekendPlanForDate } from "@/lib/db/repositories/system";
import { listOpenOpportunitiesWithSubjectForHouseholdInDateRange } from "@/lib/db/repositories/opportunities";
import { getPresentedOpportunities } from "@/lib/opportunities/present";
import { birthdaysInRange, birthdayTitle } from "@/lib/calendar/birthdays";
import { workShiftsInRange, timeOffInRange, workShiftTitle, timeOffTitle } from "@/lib/calendar/work-schedule";
import { buildChildColorMap, buildParentColorMap } from "@/lib/custody/colors";
import { buildMonthCellChips, buildMonthCellCustodyBars, type CustodyBlockLike } from "@/lib/calendar/month-cell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RenderedMarkdown } from "@/components/ui/rendered-markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeleteCalendarItemButton } from "./delete-item-button";
import { Pencil } from "lucide-react";
import { GenerateWeekendPlanButton } from "./generate-weekend-plan-button";
import { AcceptWeekendPlanButton } from "./accept-weekend-plan-button";

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
// D-132: background/text classes for the month-grid inline chip, one per
// DayItem `kind` (custody is excluded -- it gets the frame bar instead, see
// buildMonthCellChips). Deliberately separate from dotClassName (which
// stays a plain bg-* dot color used elsewhere) since a filled text chip
// needs a much lighter background to keep small text legible.
const CHIP_KIND_STYLES: Record<string, string> = {
  event: "bg-primary/10 text-primary",
  birthday: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  work_shift: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  time_off: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  // D-133: day timeline positions custody blocks too (unlike the month
  // grid's frame bar, which deliberately pulls custody out of the chip
  // list) -- a same-day handover's exact time is worth seeing on an
  // hourly timeline, so it needs its own block color here.
  custody: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

// D-133: day-view hour-positioned timeline. Pure presentational component
// over the DB-free layout math in lib/calendar/day-timeline.ts -- all the
// "where does this pixel go" work already happened there, this just draws
// the hour ruler, positions each item's block, and drops a small travel
// pill into any gap with a resolved drive-time estimate.
function DayTimelineView({
  timeline,
  day,
}: {
  timeline: import("@/lib/calendar/day-timeline").DayTimelineLayout;
  day: Date;
}) {
  const totalHours = timeline.endHour - timeline.startHour;
  const dayStart = startOfDay(day);
  const pixelsPerHour = 56;
  const trackHeight = totalHours * pixelsPerHour;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        {timeline.allDay.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b pb-2">
            {timeline.allDay.map((item) => (
              <span
                key={item.id}
                className={cn("truncate rounded-sm px-1.5 py-0.5 text-xs", CHIP_KIND_STYLES[item.kind] ?? "bg-muted text-foreground")}
              >
                {item.title}
              </span>
            ))}
          </div>
        )}
        <div className="relative flex" style={{ height: `${trackHeight}px` }}>
          <div className="relative w-12 shrink-0 text-right text-[10px] text-muted-foreground">
            {timeline.hourLabels.map((label, index) => (
              <span key={label} className="absolute right-1.5 -translate-y-1/2" style={{ top: `${(index / totalHours) * 100}%` }}>
                {label}
              </span>
            ))}
          </div>
          <div className="relative flex-1 border-l">
            {timeline.hourLabels.map((label, index) => (
              <div key={label} className="absolute left-0 w-full border-t border-dashed border-muted" style={{ top: `${(index / totalHours) * 100}%` }} />
            ))}
            {timeline.travelSegments.map((segment) => (
              <div
                key={`${segment.fromEventId}-${segment.toEventId}`}
                className="absolute left-1 flex items-center rounded-sm bg-muted px-1 text-[10px] text-muted-foreground"
                style={{ top: `${segment.topPercent}%`, height: `${segment.heightPercent}%`, minHeight: "14px" }}
              >
                {Math.round(segment.minutes)} min drive
              </div>
            ))}
            {timeline.positioned.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "absolute right-1 left-16 overflow-hidden rounded-sm border px-1.5 py-0.5 text-xs",
                  CHIP_KIND_STYLES[item.kind] ?? "bg-muted text-foreground"
                )}
                style={{ top: `${item.topPercent}%`, height: `${item.heightPercent}%`, minHeight: "18px" }}
              >
                <span className="font-medium">{item.title}</span>{" "}
                <span className="text-[10px] opacity-80">
                  {item.startsAt < dayStart ? "In progress" : format(item.startsAt, "h:mm a")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
  // D-097: only set for kind === "custody". null means a one-off block
  // (safe to edit directly); a schedule id means the block was generated
  // by materializeCustodySchedule and gets overwritten on its next
  // re-materialization, so it routes to an exception instead of a direct
  // edit form. See app/api/calendar/custody/[id]/route.ts.
  custodyScheduleId?: string | null;
  // D-132: only set for kind === "custody" -- carried alongside the
  // human-readable title ("Cal with Richard") so the month-grid custody
  // frame (buildMonthCellCustodyBars) can group/color by the underlying
  // ids without re-parsing the title string.
  childPersonId?: string;
  responsiblePersonId?: string;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string; view?: string; range?: string }>;
}) {
  const { month: monthParam, day: dayParam, view: viewParam, range: rangeParam } = await searchParams;
  const { supabase, household, selfPerson } = await requireHouseholdContext();
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
  const [attendeesByEvent, attendeeRowsByEvent] = await Promise.all([
    listAttendeeNamesForEvents(
      supabase,
      events.map((e) => e.id)
    ),
    listAttendeesForEvents(
      supabase,
      events.map((e) => e.id)
    ),
  ]);

  // Module 4 (scheduling_v2, D-120): read-only travel-time conflict
  // warnings over the same grid window already computed above. Mirrors
  // findHouseholdOwnerUser's existing three copies (lib/brief/generate.ts,
  // lib/planner/generate.ts, lib/opportunities/detect.ts) rather than
  // extracting a shared helper -- consistent with the brief's "extend,
  // don't refactor" rule for code that already works. Never mutates
  // anything; a failure here (e.g. travel API down) is swallowed to an
  // empty warning list so it can never break the calendar page itself.
  let scheduleConflicts: TravelConflictWarning[] = [];
  // D-133: same feature-flag/home-coords gate as the conflict banner below
  // powers the day-timeline's travel segments -- only resolved when the
  // day view is actually showing (range === "day"), over just that day's
  // window rather than the whole grid, since a full day timeline wants
  // EVERY adjacent leg's minutes, not only the ones flagged as too tight.
  let dayTimelineTravelLegs: DayTimelineTravelLeg[] = [];
  if (await isFeatureEnabled(supabase, household.id, "scheduling_v2")) {
    try {
      const selfPeople = await peopleRepo.list(supabase, (q) =>
        q.eq("household_id", household.id).eq("relationship_type", "self").limit(1)
      );
      const ownerUserId = selfPeople[0]?.user_id;
      const owner = ownerUserId ? await usersRepo.getById(supabase, ownerUserId) : null;
      if (owner?.home_lat != null && owner?.home_lng != null) {
        const home = { lat: owner.home_lat, lng: owner.home_lng };
        const travelOptions = { googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY, mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN };
        scheduleConflicts = await detectScheduleConflictsForHousehold(
          supabase,
          household.id,
          gridStart.toISOString(),
          gridEnd.toISOString(),
          home,
          travelOptions
        );
        if (range === "day") {
          const { located, travelMinutesByEventId } = await resolveTravelLegsForHousehold(
            supabase,
            household.id,
            startOfDay(selectedDay).toISOString(),
            endOfDay(selectedDay).toISOString(),
            home,
            travelOptions
          );
          // Each leg in travelMinutesByEventId is keyed by the "to" event's
          // id (matching detectTravelTimeConflicts's own convention); the
          // "from" event is whichever located event immediately precedes it
          // chronologically -- same pairing detectTravelTimeConflicts does
          // internally, just exposed here instead of collapsed into a
          // conflict-only warning.
          const sortedLocated = [...located]
            .filter((e) => e.locationLat != null && e.locationLng != null)
            .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
          dayTimelineTravelLegs = sortedLocated.slice(1).flatMap((toEvent, index) => {
            const fromEvent = sortedLocated[index];
            const lookup = travelMinutesByEventId.get(toEvent.id);
            if (!lookup) return [];
            return [{ fromEventId: fromEvent.id, toEventId: toEvent.id, minutes: lookup.minutes }];
          });
        }
      }
    } catch (error) {
      console.error("Calendar page: conflict detection failed (non-fatal):", error);
    }
  }

  const peopleById = new Map(people.map((p) => [p.id, p.nickname || p.full_name]));
  const childColors = buildChildColorMap(people.filter((p) => p.relationship_type === "child").map((p) => p.id));
  const defaultChildColor = { dot: "bg-primary", badge: "bg-muted text-foreground" };
  // D-132: month-grid custody frame is colored by RESPONSIBLE PARENT, not
  // by child -- "who has the kids today" is a parent-level question, and
  // reusing the child dot palette here would make the frame look like the
  // same signal as the existing per-child dots in the Custody filter's
  // legend above. Scoped to self/co_parent (the two people custody blocks
  // actually assign responsibility to today); any other relationship type
  // acting as responsible_person_id falls back to defaultParentColor below.
  const parentColors = buildParentColorMap(
    people.filter((p) => p.relationship_type === "self" || p.relationship_type === "co_parent").map((p) => p.id)
  );
  const defaultParentColor = { bar: "bg-primary", border: "border-primary" };

  // D-128: a kid-linked event (has one or more child attendees) only
  // shows on the main calendar for a day this viewer actually has custody
  // of at least one attending child — unless the viewer's own attendance
  // is "required" (a mandatory event, e.g. a game, attend regardless of
  // whose custody day it is). Events with no child attendee at all are
  // untouched. Only applies to the shared "all" view; /calendar/custody
  // stays fully visible per D-068's precedent.
  const childPersonIds = new Set(people.filter((p) => p.relationship_type === "child").map((p) => p.id));
  const eventItems: DayItem[] = events
    .filter((e) => {
      if (view === "custody") return true;
      const attendeeRows = attendeeRowsByEvent.get(e.id) ?? [];
      const childAttendeePersonIds = attendeeRows.filter((a) => childPersonIds.has(a.personId)).map((a) => a.personId);
      const viewerAttendanceStatus = attendeeRows.find((a) => a.personId === selfPerson.id)?.attendanceStatus ?? null;
      return isKidLinkedEventVisibleForViewer({
        viewerPersonId: selfPerson.id,
        childAttendeePersonIds,
        viewerAttendanceStatus,
        eventStartsAt: new Date(e.starts_at),
        custodyBlocks,
      });
    })
    .map((e) => ({
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

  // D-128: on the shared "all" view, a household can opt to only show
  // their OWN custody days inline (hide "kids with the co-parent" rows) —
  // the full who-has-the-kids-when picture is always available on the
  // dedicated /calendar/custody view regardless of this setting.
  const visibleCustodyBlocks =
    view !== "custody" && household.calendar_hide_other_parent_custody
      ? custodyBlocks.filter((c) => c.responsible_person_id === selfPerson.id)
      : custodyBlocks;

  const custodyItems: DayItem[] = visibleCustodyBlocks.map((c) => {
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
      custodyScheduleId: c.custody_schedule_id,
      childPersonId: c.child_person_id,
      responsiblePersonId: c.responsible_person_id,
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

  // D-133: day-view hour-positioned timeline. work_shift items only carry
  // a bare date (no real time -- see lib/calendar/work-schedule.ts's known
  // limitation, QUEUE note below), so they're forced into the all-day
  // strip alongside birthdays/time off rather than positioned at a
  // misleading midnight slot. Custody items keep their real times and DO
  // get positioned, since a same-day handover is genuinely time-of-day
  // information worth seeing on the timeline.
  const dayTimelineItems: DayTimelineItemLike[] = selectedDayItems.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    allDay: item.allDay || item.kind === "work_shift",
  }));
  const dayTimeline = range === "day" ? buildDayTimeline(selectedDay, dayTimelineItems, dayTimelineTravelLegs) : null;

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

      {/* D-132: the month-grid custody frame is color-coded by responsible
          parent (not child), so it needs its own legend distinct from the
          per-child dot legend above -- shown regardless of All/Custody
          filter since the frame itself renders in both. Skipped entirely
          for households with no custody blocks in view at all (e.g. no
          co-parent on file), matching the same "only show what applies"
          precedent as the per-child legend. */}
      {custodyBlocks.length > 0 && parentColors.size > 0 && (
        <div className="flex flex-wrap gap-3">
          {[...parentColors.entries()].map(([parentId, color]) => (
            <div key={parentId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("h-1.5 w-4 rounded-full", color.bar)} />
              {peopleById.get(parentId) ?? "Parent"} has the kids
            </div>
          ))}
        </div>
      )}

      {/* Module 4 (scheduling_v2, D-120): read-only conflict banner --
          purely informational, no interactive controls beyond the existing
          per-event Edit links below. Never mutates an event; see the
          conflict-detection functions this reads from for the
          no-auto-rescheduling guarantee. */}
      {scheduleConflicts.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4" />
            {scheduleConflicts.length === 1 ? "Possible scheduling conflict" : `${scheduleConflicts.length} possible scheduling conflicts`}
          </div>
          <ul className="flex flex-col gap-1 text-xs">
            {scheduleConflicts.map((w) => (
              <li key={`${w.fromEventId}-${w.toEventId}`}>
                Not enough travel time between <span className="font-medium">{w.fromEventTitle}</span> and{" "}
                <span className="font-medium">{w.toEventTitle}</span> — about {w.requiredMinutes} min needed, only{" "}
                {Math.max(w.availableMinutes, 0)} min available.
              </li>
            ))}
          </ul>
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
                {/* D-131: one-click "add the recommended activity (and its
                    prep time, if any) to the calendar" -- only offered when
                    generate.ts found a feasible recommendation to persist,
                    and swapped for a plain confirmation once accepted so a
                    second click can't double-book the same weekend. */}
                {weekendPlan.accepted_at ? (
                  <p className="text-xs text-muted-foreground">Added to your calendar.</p>
                ) : weekendPlan.recommended_activity_id && weekendPlan.recommended_block_start && weekendPlan.recommended_block_end ? (
                  // D-131 (live-verify finding): recommended_activity_id can be set from
                  // the AI's narration even when no open block exists this weekend (e.g.
                  // the whole window is inside a vacation custody block) -- generate.ts
                  // leaves recommended_block_start/end null in that case. Only offer the
                  // button when there's an actual feasible block to schedule against, so
                  // it never surfaces just to fail with a "no recommendation" error.
                  <div>
                    <AcceptWeekendPlanButton />
                  </div>
                ) : null}
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
      {/* Desktop mockup A/B: at lg+ the month grid and the selected-day
          agenda sit side by side instead of stacked, so picking a day
          doesn't require scrolling past the calendar to see it. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[380px_1fr] lg:items-start lg:gap-5">
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
                // D-132: month cell now shows real inline chips (up to 2
                // lines of "time + title") instead of a plain 3-dot summary
                // -- closer to a glance-able agenda per day. Custody blocks
                // are pulled out of the chip list and rendered as a colored
                // frame bar instead (buildMonthCellCustodyBars), since "who
                // has the kids" reads better as a border around the day
                // than another text row competing for the same 2-line slot.
                const custodyBlocksForDay: CustodyBlockLike[] = dayItems
                  .filter((item): item is typeof item & { childPersonId: string; responsiblePersonId: string } =>
                    item.kind === "custody" && item.childPersonId != null && item.responsiblePersonId != null
                  )
                  .map((item) => ({
                    id: item.id,
                    childPersonId: item.childPersonId,
                    responsiblePersonId: item.responsiblePersonId,
                    startsAt: item.startsAt,
                    endsAt: item.endsAt,
                  }));
                const custodyRows = buildMonthCellCustodyBars(day, custodyBlocksForDay);
                const chips = buildMonthCellChips(dayItems, 2);
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
                      "flex min-h-[64px] flex-col gap-0.5 rounded-md px-0.5 py-1 text-xs",
                      inMonth ? "text-foreground" : "text-muted-foreground/40",
                      selected && "bg-primary text-primary-foreground",
                      !selected && isToday(day) && "font-semibold text-primary"
                    )}
                  >
                    {custodyRows.length > 0 && (
                      <div className="relative h-1" style={{ height: `${custodyRows.length * 4}px` }}>
                        {custodyRows.map((row, rowIndex) => (
                          <div key={row.childPersonId} className="absolute left-0 h-[3px] w-full" style={{ top: `${rowIndex * 4}px` }}>
                            {row.segments.map((segment, segmentIndex) => (
                              <div
                                key={segmentIndex}
                                className={cn(
                                  "absolute h-full rounded-full",
                                  selected ? "bg-primary-foreground" : (parentColors.get(segment.responsiblePersonId) ?? defaultParentColor).bar
                                )}
                                style={{ left: `${segment.startPercent}%`, width: `${segment.widthPercent}%` }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    <span className="text-center">{format(day, "d")}</span>
                    <div className="flex flex-col gap-px overflow-hidden">
                      {chips.visible.map((chip) => (
                        <span
                          key={chip.id}
                          className={cn(
                            "truncate rounded-sm px-0.5 text-left text-[9px] leading-tight",
                            selected ? "bg-primary-foreground/20" : CHIP_KIND_STYLES[chip.kind]
                          )}
                        >
                          {chip.label}
                        </span>
                      ))}
                      {chips.overflowCount > 0 && (
                        <span className={cn("text-center text-[9px]", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                          +{chips.overflowCount} more
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      <div id="selected-day" className="flex flex-col gap-2 scroll-mt-4">
        {range !== "day" && <p className="text-xs font-medium text-muted-foreground">{format(selectedDay, "EEEE, MMMM d")}</p>}
        {dayTimeline && <DayTimelineView timeline={dayTimeline} day={selectedDay} />}
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
                  {item.kind === "custody" && !item.custodyScheduleId && (
                    <Button asChild size="icon" variant="ghost" className="size-8">
                      <Link href={`/calendar/custody/one-off/${item.id}/edit`} aria-label="Edit custody block">
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                  )}
                  {item.kind === "custody" && item.custodyScheduleId && (
                    <Button asChild size="icon" variant="ghost" className="size-8">
                      <Link
                        href={`/calendar/custody/${item.custodyScheduleId}?date=${selectedDayKey}`}
                        aria-label="Change who has custody this day"
                        title="This day comes from a recurring schedule — add an exception to change just this day"
                      >
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
    </div>
  );
}
