// D-03 (audit pass 2026-09-11): one-time cleanup for the notification
// backlog that built up before the "don't notify on manual rebuild" fix
// (see lib/brief/generate.ts's `notify` parameter) -- every click of
// "Rebuild" used to mint a fresh "daily_brief" notification for the same
// day, so the feed accumulated several near-identical entries per day.
// Keeps the newest "daily_brief" notification per (household, link_path)
// -- link_path already encodes the brief's date (`/brief/yyyy-MM-dd`), so
// grouping by it is exactly "one per household per day" -- and deletes the
// rest. Safe to re-run: a household/day with only one notification left is
// simply a no-op group.
import { createSupabaseServiceRoleClient } from "../lib/db/client-service-role";

async function main() {
  const client = createSupabaseServiceRoleClient();

  const { data: notifications, error } = await client
    .from("notifications")
    .select("id, household_id, link_path, created_at")
    .eq("notification_type", "daily_brief")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const seen = new Set<string>();
  const toDelete: string[] = [];
  for (const n of notifications ?? []) {
    const key = `${n.household_id}::${n.link_path}`;
    if (seen.has(key)) {
      toDelete.push(n.id);
    } else {
      seen.add(key);
    }
  }

  console.log(`${notifications?.length ?? 0} daily_brief notification(s) total, ${toDelete.length} duplicate(s) to remove.`);
  for (const id of toDelete) {
    const { error: deleteError } = await client.from("notifications").delete().eq("id", id);
    if (deleteError) {
      console.error(`  ! Could not delete ${id}: ${deleteError.message}`);
    } else {
      console.log(`  Deleted duplicate ${id}`);
    }
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
