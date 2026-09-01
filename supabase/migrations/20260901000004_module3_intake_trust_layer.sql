-- Module 3 (universal_intake_v2, D-119): Universal Intake + Trust Layer.
-- Additive only, per the Additive Contract (brief Section 3): two new
-- tables, nothing altered on any existing table, column, default, or
-- constraint.
--
-- Scope (see /home/user/workspace/inventory-module3.md for the gap
-- analysis this addresses -- confidence scoring, review queue, an
-- action/audit log, and verified completion were all confirmed absent
-- repo-wide):
--
--   1. intake_drafts -- the ONE table every intake format (text, voice,
--      ics, image, screenshot, pdf, forwarded email) writes into. A draft
--      is never a committed record -- per-field confidence scores travel
--      with the extracted data, and nothing in this table has any FK
--      relationship to events/tasks/people/gifts/moments. Converting an
--      approved draft into a real record happens entirely in application
--      code, through the exact same create functions Quick Capture and
--      Brain Dump already use (lib/ai/capture-actions.ts's executeAction,
--      peopleRepo.create, momentsRepo.create) -- this table has no
--      trigger or function that writes anywhere else.
--
--   2. action_log -- the trust-layer write-through log. Every autonomous
--      write logs what it read, decided, and changed, with enough of a
--      before/after snapshot to support one-tap undo later. This table is
--      populated exclusively by lib/trust/action-log.ts's withActionLog()
--      wrapper -- nothing in this migration makes any existing mutation
--      write here automatically, so with universal_intake_v2 off the
--      wrapper is skipped entirely (see lib/trust/action-log.ts) and this
--      table simply stays empty.

-- intake_drafts ----------------------------------------------------------

create table intake_drafts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  -- Nullable: some intake paths (a forwarded email, an ICS feed pull) have
  -- no specific household member "submitting" them -- only the household
  -- itself. Set whenever a specific person triggered the intake (pasting
  -- text into a capture box, uploading a photo).
  created_by_person_id uuid references people (id) on delete set null,
  source_type text not null check (
    source_type in ('text', 'voice', 'ics', 'image', 'screenshot', 'pdf', 'email')
  ),
  -- Which named parser produced this draft. 'generic' covers plain
  -- pasted/dictated text; 'activity_schedule' and 'school_flyer' are the
  -- two formats the brief names explicitly ("the two formats every
  -- competitor markets against"); 'ics' is the deterministic calendar
  -- feed parser (lib/calendar/ics-import.ts), reused as-is, not
  -- reimplemented.
  parser_used text not null default 'generic' check (
    parser_used in ('generic', 'activity_schedule', 'school_flyer', 'ics')
  ),
  -- What kind of record this would become if approved. Null while still
  -- ambiguous -- an ambiguous draft always also has status='needs_review'
  -- (enforced in application code, not a DB constraint, since "ambiguous"
  -- is a property of the AI's own classification, not a fixed rule this
  -- migration can express declaratively).
  detected_record_type text check (
    detected_record_type in ('calendar_event', 'gift_idea', 'person', 'moment', 'person_note', 'task', 'ambiguous')
  ),
  -- {"fieldName": {"value": ..., "confidence": 0.0-1.0}, ...} -- one entry
  -- per extracted field. This is the brief's "confidence score per field"
  -- requirement; deliberately jsonb (a draft's field set differs per
  -- detected_record_type) rather than a fixed column per possible field.
  extracted_fields jsonb not null default '{}'::jsonb,
  -- Household-visible "how sure are we overall" number, computed as the
  -- minimum of the per-field confidences at draft-creation time (a draft
  -- is only as trustworthy as its least-confident field) -- see
  -- lib/intake/confidence.ts. Nullable only for a source_type='ics' draft
  -- (deterministic parse, no AI confidence to report; parser_used='ics'
  -- rows treat every field as 1.0 in application code without needing a
  -- stored value).
  overall_confidence numeric check (overall_confidence is null or (overall_confidence >= 0 and overall_confidence <= 1)),
  -- Source artifact reference: for text/voice/email this is a plain
  -- excerpt of what was submitted; for image/screenshot/pdf this is
  -- expected to be a short caption/thumbnail-style description, never the
  -- full original bytes (this table is not a file store -- see
  -- lib/intake/parse.ts for why raw source bytes are deliberately not
  -- persisted here in v1, logged as QUEUE-007).
  source_excerpt text,
  status text not null default 'pending' check (
    status in ('pending', 'needs_review', 'ready', 'converted', 'rejected')
  ),
  -- Freeform note a reviewer leaves when rejecting or resolving an
  -- ambiguous draft -- not shown to anyone but household members with
  -- access to this row (household-scoped RLS below).
  review_note text,
  -- Set only once status='converted'. Exactly mirrors action_log's own
  -- table_name/record_id pair so a converted draft and its action-log
  -- entry can be cross-referenced without a FK either direction (a draft
  -- must never be deletable-blocked by a log row, and vice versa).
  converted_table text,
  converted_record_id uuid,
  parsed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_drafts_converted_pair check (
    (converted_table is null and converted_record_id is null)
    or (converted_table is not null and converted_record_id is not null)
  )
);

create trigger intake_drafts_set_updated_at
  before update on intake_drafts
  for each row execute function set_updated_at();

create index intake_drafts_household_status_idx
  on intake_drafts (household_id, status, created_at desc);

alter table intake_drafts enable row level security;

-- Same shape as brain_dump_batches (20260830000007): intake, like Brain
-- Dump and Quick Capture, has no owner/adult gate on submitting -- any
-- household member can capture a photo or paste text. Reviewing (moving
-- out of the review queue, approving, rejecting) is likewise open to any
-- household member rather than owner/adult-gated, since the brief frames
-- the review queue as a shared household inbox ("ask the user in the
-- review queue"), not an admin-only surface -- unlike, say,
-- activity_type_viability_configs which the brief treats as a household
-- policy setting.
create policy "household members read intake drafts"
  on intake_drafts for select
  using (is_household_member(household_id));

create policy "household members create intake drafts"
  on intake_drafts for insert
  with check (is_household_member(household_id));

create policy "household members update intake drafts"
  on intake_drafts for update
  using (is_household_member(household_id));

create policy "household members delete intake drafts"
  on intake_drafts for delete
  using (is_household_member(household_id));

-- action_log --------------------------------------------------------------

create table action_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  actor text not null default 'ai' check (actor in ('ai', 'system')),
  -- Free-text feature key, e.g. 'quick_capture', 'intake_convert',
  -- 'brain_dump' -- mirrors ai_usage_log.feature's own free-text
  -- convention (lib/ai/pricing.ts) rather than a closed enum, since new
  -- wrapped call sites will keep being added as more of the app adopts
  -- withActionLog().
  feature text not null,
  -- Short human-readable "what happened", already phrased in the past
  -- tense the same way Quick Capture's confirmationMessage is (e.g.
  -- "Created calendar event 'Dentist' for Dave") -- this is what the
  -- weekly digest and any future action-log UI render directly, so it
  -- must never be a raw enum value or JSON blob per the standing ground
  -- rule against showing those to the user.
  action_summary text not null,
  -- What the wrapper's caller read/considered before deciding -- e.g.
  -- which household people were resolved, which draft this came from.
  -- Structured, not prose, since this is inspection/debugging data behind
  -- the log, not the summary sentence itself.
  read_summary jsonb not null default '{}'::jsonb,
  -- Why the caller made the choice it made, when the mutation had a
  -- non-obvious decision behind it (e.g. "matched 'Dave' to person X over
  -- person Y because only X had an upcoming event mentioning bikes").
  -- Null when the action is a straightforward save.
  decision_summary text,
  table_name text not null,
  record_id uuid,
  -- Null for an insert (nothing existed before). Populated for an update
  -- so a future undo can restore exactly these column values.
  before_snapshot jsonb,
  after_snapshot jsonb,
  undoable boolean not null default false,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create index action_log_household_created_idx
  on action_log (household_id, created_at desc);

alter table action_log enable row level security;

-- Every autonomous action is logged through the caller's own
-- request-scoped, RLS-bound client (see lib/trust/action-log.ts) --
-- unlike ai_usage_log, which is written exclusively by lib/ai/client.ts
-- via the service role and has no member-facing insert policy at all.
-- Any household member can trigger a wrapped action, so any household
-- member needs insert access for their own household; every member can
-- read the household's log (the weekly digest and any future action-log
-- view are shared household transparency, not per-person); only an
-- owner/adult can mark a row undone, mirroring the "owner/adult manage
-- shared household state" pattern used for viability configs and
-- calendar feeds elsewhere in this schema.
create policy "household members read action log"
  on action_log for select
  using (is_household_member(household_id));

create policy "household members insert action log"
  on action_log for insert
  with check (is_household_member(household_id));

create policy "owner/adult mark action log undone"
  on action_log for update
  using (household_role(household_id) in ('owner', 'adult'));
