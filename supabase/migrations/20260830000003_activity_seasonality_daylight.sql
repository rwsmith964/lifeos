-- D-085 (P3-3): seasonality + daylight requirement per activity. A season
-- window (month range, inclusive, wrap-around allowed e.g. Nov-Feb) gates
-- whether an activity should be proposed at all in a given month;
-- "needs daylight" gates whether a candidate day's open block actually
-- overlaps sunrise-sunset, not just falls inside the fixed 8am-8pm
-- waking-hours window (lib/planner/available-blocks.ts) -- in December
-- that window includes several hours after sunset in Eugene/Portland that
-- a daylight-only activity (golf, fishing) can't actually use.
--
-- NULL/NULL season = year-round (today's implicit behavior for every
-- existing activity), and needs_daylight defaults to false -- both are
-- backward-compatible defaults, not a behavior change until a household
-- opts an activity in. See lib/planner/seasonality.ts for the gating logic
-- shared by the opportunity detector and the weekend planner.
alter table user_activities
  add column season_start_month smallint,
  add column season_end_month smallint,
  add column needs_daylight boolean not null default false;

alter table user_activities
  add constraint user_activities_season_start_month_range
    check (season_start_month is null or season_start_month between 1 and 12),
  add constraint user_activities_season_end_month_range
    check (season_end_month is null or season_end_month between 1 and 12),
  add constraint user_activities_season_both_or_neither
    check ((season_start_month is null) = (season_end_month is null));

comment on column user_activities.season_start_month is
  'First month (1-12) this activity is in season, inclusive. NULL (with season_end_month also NULL) means year-round -- no season restriction. Can wrap around the year (e.g. start=11, end=2 for Nov-Feb).';
comment on column user_activities.season_end_month is
  'Last month (1-12) this activity is in season, inclusive. See season_start_month for wrap-around and year-round semantics.';
comment on column user_activities.needs_daylight is
  'When true, the opportunity detector and weekend planner only propose this activity for a day/block that actually overlaps daylight hours (sunrise-sunset at the household''s home coordinates), not just the fixed 8am-8pm waking-hours window -- see lib/planner/seasonality.ts.';
