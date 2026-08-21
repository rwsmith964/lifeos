-- LifeOS: extensions and enum types
-- Every enum used across the schema is created here so later migrations can
-- reference any of them regardless of table creation order.

create extension if not exists "pgcrypto";

create type household_role as enum ('owner', 'adult', 'child', 'viewer');

create type relationship_type as enum (
  'self', 'child', 'spouse', 'partner', 'co_parent', 'parent',
  'sibling', 'extended_family', 'friend', 'colleague', 'other'
);

create type interest_strength as enum ('casual', 'regular', 'passionate');

create type interest_source as enum (
  'manual', 'inferred_from_gift', 'inferred_from_conversation'
);

create type occasion_type as enum (
  'birthday', 'christmas', 'anniversary', 'graduation', 'just_because', 'default'
);

create type gift_status as enum ('idea', 'chosen', 'ordered', 'delivered', 'given');

create type gift_reaction as enum ('loved_it', 'liked_it', 'neutral', 'missed');

create type price_tier as enum ('low', 'mid', 'high');

create type suggestion_status as enum (
  'suggested', 'saved', 'dismissed', 'converted_to_gift'
);

create type contact_type as enum ('call', 'text', 'in_person', 'activity', 'other');

create type calendar_event_type as enum (
  'personal', 'work', 'family', 'custody', 'kid_activity', 'prep', 'travel'
);

create type event_visibility as enum ('private', 'household', 'shared_with_coparent');

create type attendance_status as enum ('required', 'optional', 'informational');

create type custody_block_type as enum ('regular', 'holiday', 'swap', 'vacation');

create type household_link_type as enum ('co_parenting');

create type household_link_status as enum ('pending', 'active', 'revoked');

-- external_data_cache.source and ai_usage_log.feature are deliberately plain
-- `text`, not enums (see their migrations) — both sets grow as adapters and
-- AI features are added, and a text column avoids a migration each time.

create type notification_channel as enum ('in_app', 'email', 'push', 'sms');
