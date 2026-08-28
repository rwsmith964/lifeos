-- LifeOS D-063: preferred gift-shopping websites per person, plus the
-- "save site" bookmarking action. A person can accumulate a short list of
-- retailers/shops that have worked well for them before (Etsy, a favorite
-- hobby shop, a kids'-clothing site, etc.) -- fed into gift-suggestion
-- retailer links (lib/gifts/retailer-links.ts) once at least one exists,
-- and otherwise browsable/manageable directly from the person's page.

create table person_gift_sites (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  label text not null,
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger person_gift_sites_set_updated_at
  before update on person_gift_sites
  for each row execute function set_updated_at();

create index person_gift_sites_person_id_idx on person_gift_sites (person_id);
-- Re-saving the same URL for the same person (the "save site" action,
-- clicked twice, or against an already-bookmarked site) updates the label
-- in place rather than erroring or duplicating -- same upsert-on-conflict
-- rationale as person_interests (D-032).
create unique index person_gift_sites_person_url_unique on person_gift_sites (person_id, url);

alter table person_gift_sites enable row level security;

create policy "household members read gift sites"
  on person_gift_sites for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult manage gift sites insert"
  on person_gift_sites for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult manage gift sites update"
  on person_gift_sites for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult manage gift sites delete"
  on person_gift_sites for delete
  using (person_household_write_role_ok(person_id));
