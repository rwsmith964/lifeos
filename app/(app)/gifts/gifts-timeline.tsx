import { differenceInCalendarDays } from "date-fns";
import { occasionTypeDisplayLabel, type OccasionCandidate } from "@/lib/gifts/occasions";
import type { PersonRow } from "@/lib/db/database.types";

// Redesign (Part 2 — Gifts): "A 90-day timeline at the top with a marker per
// occasion; the nearest is filled in the action colour and its segment of
// the line is drawn in it." Positions are plain day-offset percentages
// against horizonDays, same technique as the Calendar week custody ribbon
// (lib/calendar/week-custody-ribbon.ts) -- absolute-positioned over a track
// rather than flex order, so a marker's horizontal position always matches
// its actual date.
export function GiftsTimeline({
  occasions,
  peopleById,
  today,
  horizonDays,
}: {
  occasions: OccasionCandidate[];
  peopleById: Map<string, Pick<PersonRow, "id" | "full_name">>;
  today: Date;
  horizonDays: number;
}) {
  if (occasions.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface px-[22px] py-4">
        <p className="font-sans text-body text-ink-2">Nothing on the calendar in the next {horizonDays} days.</p>
      </div>
    );
  }

  const nearest = occasions[0]!;
  const nearestOffsetPercent = clampPercent(
    (differenceInCalendarDays(nearest.occasionDate, today) / horizonDays) * 100
  );

  return (
    <div className="rounded-card border border-line bg-surface px-[22px] pt-5 pb-9">
      <p className="font-sans text-section-label uppercase text-meta">Next {horizonDays} days</p>
      <div className="relative mt-5 h-1 rounded-full bg-line">
        <div className="absolute inset-y-0 left-0 rounded-full bg-action" style={{ width: `${nearestOffsetPercent}%` }} />
        {occasions.map((occasion, index) => {
          const person = peopleById.get(occasion.personId);
          if (!person) return null;
          const offsetPercent = clampPercent((differenceInCalendarDays(occasion.occasionDate, today) / horizonDays) * 100);
          const isNearest = occasion === nearest;
          const label = `${person.full_name} — ${occasionTypeDisplayLabel(occasion.occasionType)}, ${formatMarkerDate(occasion.occasionDate)}`;
          return (
            <div
              key={`${occasion.personId}__${occasion.occasionType}__${index}`}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${offsetPercent}%` }}
              title={label}
            >
              <div
                className={
                  isNearest
                    ? "size-3 rounded-full border-2 border-action bg-action"
                    : "size-2.5 rounded-full border-2 border-line-strong bg-surface"
                }
              />
              {isNearest && (
                <p className="absolute top-4 left-1/2 w-max max-w-[160px] -translate-x-1/2 text-center font-sans text-metadata text-ink-2">
                  {person.full_name.split(" ")[0]} · {occasionTypeDisplayLabel(occasion.occasionType)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function formatMarkerDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}
