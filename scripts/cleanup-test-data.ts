// D-05 (audit pass 2026-09-11): removes leftover test/placeholder records
// that ended up in production data from earlier verification passes --
// "ZZ ..." people (People > Archive), and events/suggestions whose title
// is a known test-fixture string. Written as a repeatable script rather
// than a one-off manual delete, per the audit's own instruction. Safe to
// re-run: every match is scoped by an exact name/title pattern, and it
// only ever deletes rows matching those patterns -- a clean re-run finds
// nothing and does nothing.
import { createSupabaseServiceRoleClient } from "../lib/db/client-service-role";

const TEST_PERSON_NAME_PREFIX = "ZZ ";
const TEST_EVENT_TITLES = ["Staleness test event", "Test event from review"];

async function main() {
  const client = createSupabaseServiceRoleClient();

  const { data: testPeople, error: peopleError } = await client
    .from("people")
    .select("id, full_name, household_id")
    .like("full_name", `${TEST_PERSON_NAME_PREFIX}%`);
  if (peopleError) throw peopleError;

  console.log(`Found ${testPeople?.length ?? 0} test person record(s):`);
  for (const person of testPeople ?? []) {
    console.log(`  - ${person.full_name} (${person.id})`);
  }

  for (const person of testPeople ?? []) {
    // people has several dependent tables with a person_id FK. Rather than
    // assume every one of them cascades on delete (some may RESTRICT), try
    // the delete and report any FK violation clearly instead of silently
    // leaving a half-cleaned record.
    const { error } = await client.from("people").delete().eq("id", person.id);
    if (error) {
      console.error(`  ! Could not delete ${person.full_name} (${person.id}): ${error.message}`);
    } else {
      console.log(`  Deleted ${person.full_name} (${person.id})`);
    }
  }

  const { data: testEvents, error: eventsError } = await client
    .from("calendar_events")
    .select("id, title, household_id")
    .in("title", TEST_EVENT_TITLES);
  if (eventsError) throw eventsError;

  console.log(`Found ${testEvents?.length ?? 0} test calendar event(s):`);
  for (const event of testEvents ?? []) {
    console.log(`  - ${event.title} (${event.id})`);
    const { error } = await client.from("calendar_events").delete().eq("id", event.id);
    if (error) {
      console.error(`  ! Could not delete ${event.title} (${event.id}): ${error.message}`);
    } else {
      console.log(`  Deleted ${event.title} (${event.id})`);
    }
  }

  // Notifications referencing test data are old daily-brief snapshots
  // (frozen markdown, generated back when the ZZ test people / test
  // calendar events / test trailhead location still existed) -- the
  // underlying rows are gone now, but the notification text itself is a
  // point-in-time copy that doesn't update retroactively, so it has to be
  // cleaned up separately. Matches title OR body, since the "someone" /
  // "Someone" placeholder name and "Test event from review" both only
  // appear in the body's markdown, not the notification's own title.
  const STALE_NOTIFICATION_PATTERNS = [
    "Staleness test event",
    "Test event from review",
    "Portland Test Trailhead",
    "someone",
    "Someone",
  ];
  const notifFilter = STALE_NOTIFICATION_PATTERNS.flatMap((p) => [`title.ilike.%${p}%`, `body.ilike.%${p}%`]).join(",");
  const { data: staleNotifications, error: notifError } = await client
    .from("notifications")
    .select("id, title")
    .or(notifFilter);
  if (notifError) throw notifError;

  console.log(`Found ${staleNotifications?.length ?? 0} stale notification(s) referencing test data:`);
  for (const notification of staleNotifications ?? []) {
    console.log(`  - ${notification.title} (${notification.id})`);
    const { error } = await client.from("notifications").delete().eq("id", notification.id);
    if (error) {
      console.error(`  ! Could not delete notification ${notification.id}: ${error.message}`);
    } else {
      console.log(`  Deleted notification ${notification.id}`);
    }
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
