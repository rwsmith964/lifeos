// Module 5 — Ambient Display Mode (D-121, ambient_display flag).
//
// A read-only, responsive route for a wall-mounted tablet: today and the
// next few days, the brief's headline items, upcoming occasions,
// outstanding items, current conditions. Large type, high contrast, no
// interactive controls beyond a refresh (AmbientRefresh). Auto-refreshes
// via a full page reload on an interval rather than any client-side
// polling — see ambient-refresh.tsx for why.
//
// Additive rule: a new route rendering existing data read-only. Zero
// writes. Every value below comes from buildAmbientView
// (lib/ambient/build-ambient-view.ts), which only issues SELECTs through
// already-shipped repository functions — see that file's header comment
// and its test's explicit "no write calls of any kind" assertion, which
// is this module's acceptance criterion. No changes to the brief
// generator itself: this route never calls generateDailyBrief.
//
// Respects tenancy/permissions exactly like every other route:
// requireHouseholdContext() (the same guard app/(app)/layout.tsx uses)
// resolves the caller's own household from their session and redirects to
// /login if there's no session — RLS on every table read underneath still
// applies on top of that, same as everywhere else in the app.
//
// Deliberately placed OUTSIDE the app/(app) route group so it does not
// inherit the sidebar/bottom-nav/header chrome meant for a handheld
// session — a wall display should show nothing but the display itself.
import { format, formatDistanceToNow } from "date-fns";
import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { buildAmbientView } from "@/lib/ambient/build-ambient-view";
import { AmbientRefresh } from "./ambient-refresh";

export const metadata = {
  title: "Ambient Display — LifeOS",
};

function formatEventTime(startsAtISO: string, allDay: boolean): string {
  if (allDay) return "All day";
  return format(new Date(startsAtISO), "EEE h:mm a");
}

export default async function AmbientDisplayPage() {
  const { supabase, household, selfPerson } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "ambient_display");
  if (!enabled) {
    notFound();
  }

  const now = new Date();
  const view = await buildAmbientView(supabase, household.id, household.name, selfPerson.id, now);

  const updatedLabel = view.generatedAt
    ? `Brief updated ${formatDistanceToNow(new Date(view.generatedAt), { addSuffix: true })}`
    : "Today's brief hasn't been generated yet";

  return (
    <div className="min-h-dvh bg-black px-10 py-10 text-white sm:px-16 sm:py-14">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-white/15 pb-6">
        <div>
          <p className="text-2xl font-medium text-white/60 sm:text-3xl">{view.householdName}</p>
          <p className="text-4xl font-semibold sm:text-6xl">{format(now, "EEEE, MMMM d")}</p>
        </div>
        <p className="text-xl text-white/50 sm:text-2xl">{updatedLabel}</p>
      </header>

      {view.headline && (
        <p className="mt-8 text-4xl font-semibold leading-tight sm:text-5xl">{view.headline}</p>
      )}

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-2xl font-semibold uppercase tracking-wide text-white/50 sm:text-3xl">
            Coming up
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {view.upcomingEvents.length === 0 && (
              <li className="text-2xl text-white/40 sm:text-3xl">Nothing on the calendar right now.</li>
            )}
            {view.upcomingEvents.map((evt) => (
              <li key={evt.id} className="text-2xl sm:text-3xl">
                <span className="font-medium text-white/60">{formatEventTime(evt.starts_at, evt.all_day)}</span>
                {" — "}
                {evt.title}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold uppercase tracking-wide text-white/50 sm:text-3xl">
            Heads up
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {view.headsUp.length === 0 && (
              <li className="text-2xl text-white/40 sm:text-3xl">Nothing flagged right now.</li>
            )}
            {view.headsUp.map((item, i) => (
              <li key={i} className="text-2xl sm:text-3xl">
                <span className="font-medium">{item.title}</span>
                <span className="text-white/60"> — {item.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold uppercase tracking-wide text-white/50 sm:text-3xl">
            Upcoming occasions
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {view.upcomingOccasions.length === 0 && (
              <li className="text-2xl text-white/40 sm:text-3xl">Nothing in the next couple weeks.</li>
            )}
            {view.upcomingOccasions.map((occ, i) => (
              <li key={i} className="text-2xl sm:text-3xl">
                <span className="font-medium">{occ.personName}&apos;s {occ.occasionLabel.toLowerCase()}</span>
                <span className="text-white/60"> — {format(occ.occasionDate, "EEEE, MMMM d")}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold uppercase tracking-wide text-white/50 sm:text-3xl">
            Outstanding
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {view.outstandingCount === 0 && (
              <li className="text-2xl text-white/40 sm:text-3xl">Nothing outstanding right now.</li>
            )}
            {view.outstandingHeadlines.map((headline, i) => (
              <li key={i} className="text-2xl sm:text-3xl">
                {headline}
              </li>
            ))}
            {view.outstandingOverflow > 0 && (
              <li className="text-xl text-white/40 sm:text-2xl">+{view.outstandingOverflow} more</li>
            )}
          </ul>
        </section>
      </div>

      {view.weather && (
        <div className="mt-10 border-t border-white/15 pt-6 text-2xl text-white/70 sm:text-3xl">
          {view.weather.summary}
          {view.weather.highF != null && ` · High ${Math.round(view.weather.highF)}°F`}
          {view.weather.lowF != null && ` · Low ${Math.round(view.weather.lowF)}°F`}
        </div>
      )}

      <div className="mt-10 flex justify-end">
        <AmbientRefresh />
      </div>
    </div>
  );
}
