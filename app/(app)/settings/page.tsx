import { DepartureRemindersCard } from "./departure-reminders-card";
import { AiConsentCard } from "./ai-consent-card";
import { ChangePasswordCard } from "./change-password-card";
import { ConnectedPeople, type ConnectionView, type PendingLinkInviteView } from "./connected-people";
import { listLinkedAccounts, listPendingLinkInvites, listSharesForLinks } from "@/lib/db/repositories/links";
import Link from "next/link";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { listInvitesForHousehold, listMembersOfHousehold, usersRepo } from "@/lib/db/repositories/households";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listCalendarFeedsForHousehold } from "@/lib/db/repositories/calendar";
import { listWorkSchedulesForPerson, listTimeOffForPerson } from "@/lib/db/repositories/work-schedule";
import { SettingsForm } from "./settings-form";
import { HouseholdMembers, type HouseholdMemberDisplay } from "./household-members";
import { HouseholdSwitcher, type HouseholdSwitcherItem } from "./household-switcher";
import { CalendarFeeds } from "./calendar-feeds";
import { MySchedule } from "./my-schedule";
import { FeatureFlags } from "./feature-flags";
import { DeleteAccountButton } from "./delete-account-button";
import { listFeatureFlagStates } from "@/lib/flags";
import { ThemeToggle } from "@/components/theme-toggle";
import { PalettePicker } from "@/components/palette-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default async function SettingsPage() {
  const { supabase, household, userId, memberships, timezone, aiConsent } = await requireHouseholdContext();
  const user = await usersRepo.getById(supabase, userId);
  const switcherItems: HouseholdSwitcherItem[] = memberships.map((m) => ({
    householdId: m.household.id,
    householdName: m.household.name,
    role: m.role,
  }));

  const [members, invites, calendarFeeds, people, featureFlagStates] = await Promise.all([
    listMembersOfHousehold(supabase, household.id),
    listInvitesForHousehold(supabase, household.id),
    listCalendarFeedsForHousehold(supabase, household.id),
    listPeopleForHousehold(supabase, household.id),
    listFeatureFlagStates(supabase, household.id),
  ]);
  // The account owner's own person record (relationship_type "self") is
  // intentionally excluded from /people (P0-5), so their own work schedule
  // and time off -- otherwise unreachable -- are managed here instead.
  // Whoever is signed in: the household's own "self" person, or (for someone
  // invited in) the existing person they claimed.
  const selfPerson = people.find((p) => p.user_id === userId);
  const [myWorkSchedules, myTimeOff] = selfPerson
    ? await Promise.all([
        listWorkSchedulesForPerson(supabase, selfPerson.id),
        listTimeOffForPerson(supabase, selfPerson.id),
      ])
    : [[], []];
  // Connected households (a brother-in-law, a co-parent...). Tolerates the
  // migration not being applied yet, so the rest of Settings still loads.
  const [linkedAccounts, pendingLinkInvites] = await Promise.all([
    listLinkedAccounts(supabase, household.id).catch(() => []),
    listPendingLinkInvites(supabase, household.id).catch(() => []),
  ]);
  const linkShares = await listSharesForLinks(supabase, [...new Set(linkedAccounts.map((a) => a.linkId))]).catch(() => []);
  const connectionViews: ConnectionView[] = [...new Set(linkedAccounts.map((a) => a.linkId))].map((linkId) => {
    const accounts = linkedAccounts.filter((a) => a.linkId === linkId);
    const enabled = (sharing: string, category: "busy_times" | "custody") =>
      linkShares.some((sh) => sh.link_id === linkId && sh.sharing_household_id === sharing && sh.category === category && sh.enabled);
    const otherId = accounts[0].otherHouseholdId;
    return {
      linkId,
      householdName: accounts[0].otherHouseholdName,
      accountNames: accounts.map((a) => a.userDisplayName),
      iShare: { busy_times: enabled(household.id, "busy_times"), custody: enabled(household.id, "custody") },
      theyShare: { busy_times: enabled(otherId, "busy_times"), custody: enabled(otherId, "custody") },
    };
  });
  const personNameById = new Map(people.map((pp) => [pp.id, pp.nickname || pp.full_name]));
  const pendingViews: PendingLinkInviteView[] = pendingLinkInvites.map((inv) => ({
    id: inv.id,
    email: inv.invited_email,
    personName: inv.for_person_id ? (personNameById.get(inv.for_person_id) ?? null) : null,
  }));
  const invitablePeople = people
    .filter((pp) => !pp.is_archived && !pp.user_id && !pp.linked_user_id && pp.relationship_type !== "self" && pp.relationship_type !== "child")
    .map((pp) => ({ id: pp.id, name: pp.nickname || pp.full_name }));
  const todayStr = format(getZonedNow(timezone), "yyyy-MM-dd");
  const myUpcomingTimeOff = myTimeOff.filter((entry) => entry.end_date >= todayStr);
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
    <div className="flex flex-col gap-[18px]">
      <h1 className="font-serif text-page-title text-ink">Settings</h1>
      <Card>
        <CardContent className="flex flex-col gap-[18px]">
          <h2 className="font-sans text-section-label uppercase text-meta">Appearance</h2>
          <div className="flex flex-col gap-2">
            <Label>Theme</Label>
            <ThemeToggle />
            <p className="font-sans text-metadata text-meta">
              &quot;System&quot; follows your device&apos;s light/dark setting automatically.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Palette</Label>
            <PalettePicker />
            <p className="font-sans text-metadata text-meta">Choose the colour system used across Famwise.</p>
          </div>
        </CardContent>
      </Card>
      <SettingsForm
        household={household}
        timezone={user?.timezone ?? "America/Los_Angeles"}
        homeAddress={user?.home_address ?? ""}
      />
      {selfPerson && (
        <MySchedule personId={selfPerson.id} workSchedules={myWorkSchedules} upcomingTimeOff={myUpcomingTimeOff} />
      )}
      <HouseholdSwitcher households={switcherItems} activeHouseholdId={household.id} />
      <HouseholdMembers
        members={memberDisplays}
        invites={invites}
        canManage={canManage}
        currentUserId={userId}
      />
      <ConnectedPeople connections={connectionViews} pending={pendingViews} invitablePeople={invitablePeople} canManage={canManage} />
      <DepartureRemindersCard />
      <ChangePasswordCard />
      <AiConsentCard granted={aiConsent === "granted"} />
      <CalendarFeeds feeds={calendarFeeds} canManage={canManage} />
      <FeatureFlags states={featureFlagStates} canManage={canManage} />
      <Card>
        <CardContent className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-metadata text-ink-2">Activity</h2>
            <p className="font-sans text-metadata text-meta">
              See what the assistant did on its own, and undo an action if needed.
            </p>
          </div>
          <Link href="/settings/activity" className="font-sans text-body font-bold text-action underline-offset-2 hover:underline">
            View activity log
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-metadata text-ink-2">Delete account</h2>
            <p className="font-sans text-metadata text-meta">
              Permanently delete your login and your household&apos;s data.
            </p>
          </div>
          <DeleteAccountButton />
        </CardContent>
      </Card>
    </div>
  );
}
