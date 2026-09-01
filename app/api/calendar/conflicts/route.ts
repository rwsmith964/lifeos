// GET /api/calendar/conflicts — Module 4 (scheduling_v2, D-120) read-only
// travel-time conflict warnings for the current household's upcoming week.
// Per the brief's additive rule ("conflict detection produces warnings
// only... conflict warnings never mutate an event") this route makes no
// writes at all — it only reads events and calls the pure/async detection
// functions already built and tested in lib/scheduling/. With scheduling_v2
// off this route returns 404, matching the pattern used by
// app/api/intake/route.ts for universal_intake_v2.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { detectScheduleConflictsForHousehold } from "@/lib/scheduling/detect-conflicts";
import { peopleRepo } from "@/lib/db/repositories/people";
import { usersRepo } from "@/lib/db/repositories/households";
import type { SupabaseClient } from "@supabase/supabase-js";

const WINDOW_DAYS = 7;

/** Mirrors lib/brief/generate.ts's private findHouseholdOwnerUser -- kept as
 * its own small copy rather than exporting/reusing that function, since it's
 * one query and the brief says extend, don't refactor, shipped modules. */
async function findHouseholdOwnerHome(client: SupabaseClient, householdId: string) {
  const people = await peopleRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("relationship_type", "self").limit(1)
  );
  const self = people[0];
  if (!self?.user_id) return null;
  const user = await usersRepo.getById(client, self.user_id);
  if (user?.home_lat == null || user?.home_lng == null) return null;
  return { lat: user.home_lat, lng: user.home_lng };
}

export async function GET() {
  const { supabase, household } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "scheduling_v2");
  if (!enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const home = await findHouseholdOwnerHome(supabase, household.id);
  if (!home) {
    // No home address on file yet -- nothing to compute travel legs from.
    // Same graceful "no signal, no warnings" behavior as the brief
    // generator's travel-time section, not an error state.
    return NextResponse.json({ warnings: [] });
  }

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);

  try {
    const warnings = await detectScheduleConflictsForHousehold(
      supabase,
      household.id,
      windowStart.toISOString(),
      windowEnd.toISOString(),
      home,
      {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
        mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
      }
    );
    return NextResponse.json({ warnings });
  } catch (error) {
    console.error("GET /api/calendar/conflicts failed:", error);
    return NextResponse.json({ error: "Couldn't check for scheduling conflicts right now." }, { status: 500 });
  }
}
