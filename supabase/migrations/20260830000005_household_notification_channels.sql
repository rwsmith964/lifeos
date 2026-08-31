-- P3-5: "Add delivery channel preferences (email/push) in Settings and
-- actually send the daily brief." The dispatcher (lib/notifications/dispatch.ts)
-- and per-channel adapters already existed; the brief generator hardcoded
-- ["in_app", "email"] with no way for a household to opt out of email or
-- (once v2 ships) opt in to push. This column makes that a real,
-- household-editable preference instead of a hardcoded literal.
--
-- in_app is intentionally always included by application code (it backs the
-- notification bell itself, not an external channel a household would want
-- to disable) rather than being stored here — this column only needs to
-- hold the channels that are actually optional: email and, once the Expo
-- shell ships (Section 10.3), push. sms is deferred (Section 10.4) and not
-- exposed in Settings.
alter table households
  add column notification_channels notification_channel[] not null default '{email}';

comment on column households.notification_channels is
  'Optional delivery channels (beyond always-on in_app) a household has opted into for automated notifications like the daily brief. Currently email is real (Resend); push is stored for forward-compatibility but is a no-op until the v2 Expo shell ships.';
