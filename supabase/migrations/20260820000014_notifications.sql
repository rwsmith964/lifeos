-- LifeOS: notifications — backs the in-app notification center (Section
-- 10.2). Not explicitly listed in Section 4.2's table list, but required by
-- "In-app — notification center, unread state"; see DECISIONS.md D-008.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  link_path text,
  channels notification_channel[] not null default '{in_app}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_person_id_idx on notifications (person_id);
create index notifications_household_id_idx on notifications (household_id);
create index notifications_unread_idx on notifications (person_id) where read_at is null;

alter table notifications enable row level security;

create policy "recipient reads their own notifications"
  on notifications for select
  using (
    exists (
      select 1 from people p
      where p.id = notifications.person_id
        and p.user_id = auth.uid()
    )
  );

create policy "recipient marks their own notifications read"
  on notifications for update
  using (
    exists (
      select 1 from people p
      where p.id = notifications.person_id
        and p.user_id = auth.uid()
    )
  );

-- Row creation is done by lib/notifications/dispatch.ts using the service
-- role key, which bypasses RLS by design — no insert policy for regular
-- users.
