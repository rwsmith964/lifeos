-- LifeOS D-068: per-person toggle for whether a person's work_schedules /
-- time_off_entries occurrences (D-064) are expanded onto the main
-- /calendar view. Motivated by a real production case: the household
-- owner added a work schedule for his mother (a "parent"-type person,
-- added for other reasons -- e.g. tracking her birthday/contact cadence)
-- and didn't want her shifts cluttering his own calendar, but might
-- reasonably want a spouse's or partner's shifts to show. D-064 shipped
-- with an implicit "every household person's schedule shows" behavior
-- (see lib/db/repositories/work-schedule.ts's listWorkSchedulesForPeople,
-- called with every household person id) with no way to opt any one of
-- them out -- this column makes that explicit and opt-in instead.
--
-- Defaults to false for everyone except the household owner's own "self"
-- person record, which is backfilled to true so existing behavior for the
-- primary user is unchanged. Every other existing person (spouse, parent,
-- co_parent, etc.) starts opted OUT -- matches the reported "don't show
-- Mom's schedule" case, and is a deliberately conservative default: a
-- newly added person's shifts should not silently start appearing on the
-- calendar until the household member managing them chooses to. The
-- /calendar/custody page's co-parent-schedule section (same migration's
-- companion app code) intentionally does NOT read this flag -- showing a
-- co-parent's shifts there is the whole point of that view regardless of
-- whether the household also wants them on the main calendar.
alter table people
  add column show_work_schedule_on_calendar boolean not null default false;

update people
  set show_work_schedule_on_calendar = true
  where relationship_type = 'self';
