-- LifeOS: (1) people.gifts_enabled -- "we don't get gifts for this person".
-- Defaults true so nothing changes for anyone until it is switched off; when
-- false the gift engine, Today and the Gifts timeline skip them.
-- (2) To-do lists: todo_lists (shared with the whole household, or personal
-- to one person) and todos (an item on a list, optionally assigned to a
-- person and given a due date).

alter table people add column gifts_enabled boolean not null default true;

create table todo_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- 'shared': every member of the household sees and edits it.
  -- 'personal': only owner_person_id sees it.
  visibility text not null check (visibility in ('shared', 'personal')),
  owner_person_id uuid not null references people (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger todo_lists_set_updated_at
  before update on todo_lists
  for each row execute function set_updated_at();
create index todo_lists_household_id_idx on todo_lists (household_id);

-- Can the signed-in user see this list? Shared lists: any household member.
-- Personal lists: only the person who owns it.
create function can_access_todo_list(list_visibility text, list_owner_person_id uuid, list_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_household_member(list_household_id)
    and (
      list_visibility = 'shared'
      or exists (
        select 1 from people p
        where p.id = list_owner_person_id and p.user_id = auth.uid()
      )
    );
$$;

alter table todo_lists enable row level security;

create policy "members read accessible todo lists"
  on todo_lists for select
  using (can_access_todo_list(visibility, owner_person_id, household_id));

create policy "members create todo lists"
  on todo_lists for insert
  with check (
    household_role(household_id) in ('owner', 'adult')
    and exists (
      select 1 from people p
      where p.id = todo_lists.owner_person_id
        and p.household_id = todo_lists.household_id
        and p.user_id = auth.uid()
    )
  );

create policy "members update accessible todo lists"
  on todo_lists for update
  using (can_access_todo_list(visibility, owner_person_id, household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "members delete accessible todo lists"
  on todo_lists for delete
  using (can_access_todo_list(visibility, owner_person_id, household_id) and household_role(household_id) in ('owner', 'adult'));

create table todos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  list_id uuid not null references todo_lists (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text not null default '',
  due_date date,
  assigned_to_person_id uuid references people (id) on delete set null,
  created_by_person_id uuid not null references people (id) on delete cascade,
  completed_at timestamptz,
  completed_by_person_id uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger todos_set_updated_at
  before update on todos
  for each row execute function set_updated_at();
create index todos_list_id_idx on todos (list_id);
create index todos_household_id_idx on todos (household_id);
create index todos_assigned_idx on todos (assigned_to_person_id) where completed_at is null;

alter table todos enable row level security;

-- An item is reachable exactly when its list is (the subquery runs under the
-- todo_lists policies above, so personal lists stay private).
create policy "members read todos on accessible lists"
  on todos for select
  using (exists (select 1 from todo_lists l where l.id = todos.list_id));

create policy "members add todos to accessible lists"
  on todos for insert
  with check (
    household_role(household_id) in ('owner', 'adult')
    and exists (select 1 from todo_lists l where l.id = todos.list_id and l.household_id = todos.household_id)
  );

create policy "members update todos on accessible lists"
  on todos for update
  using (household_role(household_id) in ('owner', 'adult') and exists (select 1 from todo_lists l where l.id = todos.list_id));

create policy "members delete todos on accessible lists"
  on todos for delete
  using (household_role(household_id) in ('owner', 'adult') and exists (select 1 from todo_lists l where l.id = todos.list_id));
