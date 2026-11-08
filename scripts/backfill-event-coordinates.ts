// Gives upcoming events that have an address but no map coordinates their
// coordinates, so drive-time suggestions work for events created before
// events were geocoded on save. Respects Nominatim's 1 request/second limit.
// Safe to re-run: only touches events still missing coordinates.
//   npx tsx --env-file=.env.local scripts/backfill-event-coordinates.ts
import { createSupabaseServiceRoleClient } from "../lib/db/client-service-role";
import { coordinatesForLocation } from "../lib/calendar/geocode-event";

async function main() {
  const client = createSupabaseServiceRoleClient();
  const { data, error } = await client
    .from("calendar_events")
    .select("id, title, location")
    .not("location", "is", null)
    .is("location_lat", null)
    .gte("starts_at", new Date().toISOString())
    .limit(200);
  if (error) throw error;

  console.log(`${data?.length ?? 0} upcoming event(s) with an address and no coordinates.`);
  let updated = 0;
  for (const event of data ?? []) {
    const coords = await coordinatesForLocation(event.location as string);
    if (coords) {
      const { error: updateError } = await client
        .from("calendar_events")
        .update({ location_lat: coords.lat, location_lng: coords.lng })
        .eq("id", event.id);
      if (updateError) throw updateError;
      updated += 1;
      console.log(`  ok   ${event.title} -> ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    } else {
      console.log(`  skip ${event.title} (couldn't find "${event.location}")`);
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log(`Done: ${updated} updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
