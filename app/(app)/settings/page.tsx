import { requireHouseholdContext } from "@/lib/auth/session";
import { usersRepo } from "@/lib/db/repositories/households";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { supabase, household, userId } = await requireHouseholdContext();
  const user = await usersRepo.getById(supabase, userId);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForm household={household} timezone={user?.timezone ?? "America/Los_Angeles"} />
    </div>
  );
}
