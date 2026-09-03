import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { packingListsRepo, listItemsForPackingList } from "@/lib/db/repositories/packing";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { PackingListDetail } from "./packing-list-detail";

export default async function PackingListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "packing_checklist_v2");
  if (!enabled) {
    notFound();
  }

  const packingList = await packingListsRepo.getById(supabase, id);
  if (!packingList || packingList.household_id !== household.id) {
    notFound();
  }

  const [items, people] = await Promise.all([
    listItemsForPackingList(supabase, id),
    listPeopleForHousehold(supabase, household.id),
  ]);

  return <PackingListDetail packingList={packingList} items={items} people={people} />;
}
