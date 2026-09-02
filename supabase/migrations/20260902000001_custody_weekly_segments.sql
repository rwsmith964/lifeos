-- LifeOS: custody schedule whole-record editing + a new day-of-week/
-- time-of-day recurrence mode for custody_schedules.
--
-- Two independent, additive changes:
--
-- 1. cycle_length_days / cycle_assignments / anchor_date become nullable.
--    Every existing row already has non-null values in all three (they
--    were required NOT NULL columns), so this is a pure relaxation with
--    no data migration -- it only makes room for a schedule that uses the
--    new recurrence_type below instead of the cycle engine, which has no
--    meaningful cycle_length_days/cycle_assignments/anchor_date at all.
--
-- 2. recurrence_type + weekly_segments: a schedule is now either
--      - 'cycle' (default, existing behavior, untouched) -- a repeating
--        N-day cycle with exactly one responsible parent per whole
--        calendar day (lib/custody/schedule.ts cycleAssignmentForDate).
--      - 'weekly_segments' -- a fixed weekly pattern expressed as a list
--        of { dayOfWeek: 0-6, time: "HH:MM", responsiblePersonId } break-
--        points. Between any two consecutive breakpoints (sorted by
--        weekday+time, wrapping across the week), the earlier breakpoint's
--        person has custody. This is what lets one calendar day be split
--        between two people at an exact clock time (e.g. Friday: Mel until
--        4:30pm, then the other parent from 4:30pm) -- something the
--        one-person-per-day cycle model structurally cannot express. See
--        DECISIONS.md D-125 and lib/custody/schedule.ts
--        projectWeeklySegmentSchedule.
--
-- Every existing schedule row is unaffected: recurrence_type defaults to
-- 'cycle' and weekly_segments defaults to null, so nothing changes for
-- them and the rolling/cycle-based model (presets, weekly day-by-day,
-- advanced custom cycle) remains fully available exactly as it was.

alter table custody_schedules
  alter column cycle_length_days drop not null,
  alter column cycle_assignments drop not null,
  alter column anchor_date drop not null;

alter table custody_schedules
  add column recurrence_type text not null default 'cycle'
    check (recurrence_type in ('cycle', 'weekly_segments')),
  -- Array of { "dayOfWeek": 0..6 (0=Sunday), "time": "HH:MM", "responsiblePersonId": uuid }.
  -- Validated at the application layer (Zod) -- Postgres just stores it.
  add column weekly_segments jsonb;

-- A schedule must have the fields its own recurrence_type actually needs:
-- 'cycle' schedules keep requiring the three cycle columns (matching the
-- NOT NULL behavior they had before this migration); 'weekly_segments'
-- schedules require a non-empty weekly_segments array instead.
alter table custody_schedules
  add constraint custody_schedules_recurrence_fields_check check (
    (recurrence_type = 'cycle'
      and cycle_length_days is not null
      and cycle_assignments is not null
      and anchor_date is not null)
    or
    (recurrence_type = 'weekly_segments'
      and weekly_segments is not null
      and jsonb_array_length(weekly_segments) > 0)
  );
