-- QUEUE-041: the flight intake cascade (lib/intake/trip-cascade.ts, D-142)
-- hardcoded a 120-minute TSA security-cutoff buffer for every household.
-- computeTripCascade() already accepted an optional tsaBufferMinutes
-- override -- this column is the household-level source for that override,
-- so a household with young kids, TSA PreCheck, or an airport that tends to
-- run slower/faster than the domestic-flight default can tune it without
-- an agent editing a constant in code.
--
-- Nullable rather than "not null default 120", matching the
-- "absence means use the application default" posture already used
-- elsewhere (e.g. feature_flags: no row = not enabled). This keeps
-- DEFAULT_TSA_BUFFER_MINUTES as the single source of truth for the
-- default value -- it only needs to live in one place (application code),
-- not be duplicated into a SQL column default that could drift from it.
alter table households
  add column tsa_buffer_minutes integer;

comment on column households.tsa_buffer_minutes is
  'Household-level override (in minutes) for how long before a flight''s stated departure time the intake trip cascade assumes travelers need to be through security. Null means use the application default (DEFAULT_TSA_BUFFER_MINUTES in lib/intake/trip-cascade.ts, currently 120).';

alter table households
  add constraint households_tsa_buffer_minutes_check
  check (tsa_buffer_minutes is null or (tsa_buffer_minutes >= 0 and tsa_buffer_minutes <= 600));
