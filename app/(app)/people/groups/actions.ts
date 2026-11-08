"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { personGroupsRepo } from "@/lib/db/repositories/groups";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { friendlyMutationError } from "@/lib/db/errors";

export interface GroupActionResult {
  error: string | null;
}

const groupSchema = z.object({
  name: z.string().trim().min(1, "Give the group a name.").max(60),
  memberPersonIds: z.array(z.string().uuid()).min(1, "Pick at least one person."),
});

export async function createGroupAction(input: z.infer<typeof groupSchema>): Promise<GroupActionResult> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the group details." };
  const { supabase, household } = await requireHouseholdContext();
  try {
    // Only people in this household can be members.
    const people = await listPeopleForHousehold(supabase, household.id);
    const valid = parsed.data.memberPersonIds.filter((id) => people.some((p) => p.id === id));
    if (valid.length === 0) return { error: "Pick at least one person." };
    await personGroupsRepo.create(supabase, { household_id: household.id, name: parsed.data.name, member_person_ids: valid });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't create the group — please try again." }) };
  }
  revalidatePath("/people/groups");
  return { error: null };
}

export async function deleteGroupAction(groupId: string): Promise<GroupActionResult> {
  if (!z.string().uuid().safeParse(groupId).success) return { error: "That group wasn't found." };
  const { supabase } = await requireHouseholdContext();
  try {
    await personGroupsRepo.remove(supabase, groupId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't delete the group — please try again." }) };
  }
  revalidatePath("/people/groups");
  return { error: null };
}
