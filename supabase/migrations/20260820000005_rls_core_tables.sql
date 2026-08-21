-- LifeOS: RLS for households, users, household_members, household_links.
-- Section 6.2: RLS enabled on every table, no exceptions, default deny.

alter table households enable row level security;
alter table users enable row level security;
alter table household_members enable row level security;
alter table household_links enable row level security;

-- households ----------------------------------------------------------

create policy "members can read their households"
  on households for select
  using (is_household_member(id));

create policy "any authenticated user can create a household"
  on households for insert
  with check (auth.uid() is not null);

create policy "owners can update their household"
  on households for update
  using (household_role(id) = 'owner');

create policy "owners can delete their household"
  on households for delete
  using (household_role(id) = 'owner');

-- users ----------------------------------------------------------------
-- A user can read their own profile, and the profile of anyone they share a
-- household with (needed to render e.g. "shared by Jane" on events).

create policy "read own profile or a household-mate's profile"
  on users for select
  using (
    id = auth.uid()
    or exists (
      select 1 from household_members mine
      join household_members theirs on theirs.household_id = mine.household_id
      where mine.user_id = auth.uid()
        and theirs.user_id = users.id
    )
  );

create policy "users can insert their own profile row"
  on users for insert
  with check (id = auth.uid());

create policy "users can update their own profile"
  on users for update
  using (id = auth.uid());

-- household_members ------------------------------------------------------

create policy "members can read their household's membership list"
  on household_members for select
  using (is_household_member(household_id));

-- Bootstraps onboarding: a user may insert themselves as a member of a
-- household with no members yet (i.e. the household they just created), or
-- an owner may add further members.
create policy "self-join an empty household, or owner adds members"
  on household_members for insert
  with check (
    user_id = auth.uid()
    and (
      not exists (
        select 1 from household_members existing
        where existing.household_id = household_members.household_id
      )
      or household_role(household_id) = 'owner'
    )
  );

create policy "owners manage membership roles"
  on household_members for update
  using (household_role(household_id) = 'owner');

create policy "owners remove members"
  on household_members for delete
  using (household_role(household_id) = 'owner');

-- household_links ---------------------------------------------------------
-- No invitation UI in v1 (Section 6.4) but the policy is real so the model
-- is provably correct once the UI lands.

create policy "members can read links touching their household"
  on household_links for select
  using (is_household_member(household_a_id) or is_household_member(household_b_id));

create policy "owners create links from either side"
  on household_links for insert
  with check (household_role(household_a_id) = 'owner' or household_role(household_b_id) = 'owner');

create policy "owners update link status from either side"
  on household_links for update
  using (household_role(household_a_id) = 'owner' or household_role(household_b_id) = 'owner');
