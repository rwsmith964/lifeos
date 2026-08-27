import { requireHouseholdContext } from "@/lib/auth/session";
import { listInvitesForHousehold, listMembersOfHousehold, usersRepo } from "@/lib/db/repositories/households";
import { SettingsForm } from "./settings-form";
import { HouseholdMembers, type HouseholdMemberDisplay } from "./household-members";
import { HouseholdSwitcher, type HouseholdSwitcherItem } from "./household-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default async function SettingsPage() {
  const { supabase, household, userId, memberships } = await requireHouseholdContext();
  const user = await usersRepo.getById(supabase, userId);
  const switcherItems: HouseholdSwitcherItem[] = memberships.map((m) => ({
    householdId: m.household.id,
    householdName: m.household.name,
    role: m.role,
  }));

  const [members, invites] = await Promise.all([
    listMembersOfHousehold(supabase, household.id),
    listInvitesForHousehold(supabase, household.id),
  ]);
  const memberUsers = await Promise.all(members.map((m) => usersRepo.getById(supabase, m.user_id)));
  const memberDisplays: HouseholdMemberDisplay[] = members.map((m, i) => ({
    memberId: m.id,
    userId: m.user_id,
    displayName: memberUsers[i]?.display_name ?? "Unknown",
    role: m.role,
    isSelf: m.user_id === userId,
  }));
  const selfMembership = members.find((m) => m.user_id === userId);
  const canManage = selfMembership?.role === "owner" || selfMembership?.role === "adult";

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <Label>Appearance</Label>
          <ThemeToggle />
          <p className="text-xs text-muted-foreground">
            &quot;System&quot; follows your device&apos;s light/dark setting automatically.
          </p>
        </CardContent>
      </Card>
      <SettingsForm
        household={household}
        timezone={user?.timezone ?? "America/Los_Angeles"}
        homeAddress={user?.home_address ?? ""}
      />
      <HouseholdSwitcher households={switcherItems} activeHouseholdId={household.id} />
      <HouseholdMembers
        members={memberDisplays}
        invites={invites}
        canManage={canManage}
        currentUserId={userId}
      />
    </div>
  );
}
