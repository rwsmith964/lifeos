// Hand-authored types mirroring supabase/migrations/*.sql exactly.
// If you change a migration, change this file in the same commit.

export type HouseholdRole = "owner" | "adult" | "child" | "viewer";

export type RelationshipType =
  | "self"
  | "child"
  | "spouse"
  | "partner"
  | "co_parent"
  | "parent"
  | "sibling"
  | "extended_family"
  | "friend"
  | "colleague"
  | "other";

export type InterestStrength = "casual" | "regular" | "passionate";

export type InterestSource = "manual" | "inferred_from_gift" | "inferred_from_conversation";

export type OccasionType =
  | "birthday"
  | "christmas"
  | "anniversary"
  | "graduation"
  | "just_because"
  | "default";

export type GiftStatus = "idea" | "chosen" | "ordered" | "delivered" | "given";

export type GiftReaction = "loved_it" | "liked_it" | "neutral" | "missed";

export type PriceTier = "low" | "mid" | "high";

export type SuggestionStatus = "suggested" | "saved" | "ordered" | "dismissed" | "converted_to_gift";

// Module 1 (relationship_gift_engine_v2) additive enrichment of gift_suggestions -- see GiftSuggestionRow.pipeline_stage.
export type GiftPipelineStage =
  | "idea"
  | "shortlisted"
  | "decided"
  | "ordered"
  | "shipped"
  | "arrived"
  | "given";

export type ContactType = "call" | "text" | "in_person" | "activity" | "other";

export type CalendarEventType =
  | "personal"
  | "work"
  | "family"
  | "custody"
  | "kid_activity"
  | "prep"
  | "travel"
  // P3-6: rows materialized from a household's imported Google
  // Calendar/iCal feed (calendar_feeds) -- distinct from "personal" so
  // the calendar UI can label them as imported rather than user-typed.
  | "external";

export type EventVisibility = "private" | "household" | "shared_with_coparent";

export type AttendanceStatus = "required" | "optional" | "informational";

export type CustodyBlockType = "regular" | "holiday" | "swap" | "vacation";

export type HouseholdLinkType = "co_parenting";

export type HouseholdLinkStatus = "pending" | "active" | "revoked";

export type NotificationChannel = "in_app" | "email" | "push" | "sms";

/** Row minus the keys the DB generates/defaults, with those keys optional. */
type Insert<Row, GeneratedKeys extends keyof Row> = Omit<Row, GeneratedKeys> &
  Partial<Pick<Row, GeneratedKeys>>;

/** Every column is independently updatable, id excluded. */
type Update<Row extends { id: string }> = Partial<Omit<Row, "id">>;

// households --------------------------------------------------------------

export interface HouseholdRow {
  id: string;
  name: string;
  default_gift_budget_min_cents: number | null;
  default_gift_budget_max_cents: number | null;
  gift_scan_horizon_days: number;
  gift_prompt_buffer_days: number;
  gift_handling_buffer_days: number;
  gift_personal_buffer_days: number;
  ai_daily_spend_ceiling_cents: number;
  brief_time: string;
  // P3-5: optional delivery channels beyond the always-on in_app channel
  // (see migration 20260830000005 for why in_app itself isn't stored here).
  notification_channels: NotificationChannel[];
  // D-128: when true, the shared /calendar ("all") view only shows custody
  // blocks where this household's self person is responsible — the
  // co-parent's custody days are hidden inline (still fully visible on
  // /calendar/custody, which is deliberately the full picture per D-068).
  // Defaults true to match the reported preference out of the box.
  calendar_hide_other_parent_custody: boolean;
  // QUEUE-041: household-level override for the flight intake cascade's
  // TSA security-cutoff buffer. Null means "use the application default"
  // (DEFAULT_TSA_BUFFER_MINUTES in lib/intake/trip-cascade.ts).
  tsa_buffer_minutes: number | null;
  created_at: string;
  updated_at: string;
}
export type HouseholdInsert = Insert<
  HouseholdRow,
  | "id"
  | "default_gift_budget_min_cents"
  | "default_gift_budget_max_cents"
  | "gift_scan_horizon_days"
  | "gift_prompt_buffer_days"
  | "gift_handling_buffer_days"
  | "gift_personal_buffer_days"
  | "ai_daily_spend_ceiling_cents"
  | "brief_time"
  | "notification_channels"
  | "calendar_hide_other_parent_custody"
  | "tsa_buffer_minutes"
  | "created_at"
  | "updated_at"
>;
export type HouseholdUpdate = Update<HouseholdRow>;

// users ----------------------------------------------------------------

export interface UserRow {
  id: string;
  display_name: string;
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
  timezone: string;
  // Which of this user's household_members rows is currently "active" -
  // i.e. what requireHouseholdContext() resolves to and every page shows.
  // Null for the common single-household case (falls back to their only
  // membership); only meaningfully used once a user belongs to >1
  // household (D-055 household switching, 20260827000002).
  active_household_id: string | null;
  created_at: string;
  updated_at: string;
}
export type UserInsert = Insert<
  UserRow,
  | "home_address"
  | "home_lat"
  | "home_lng"
  | "timezone"
  | "active_household_id"
  | "created_at"
  | "updated_at"
>;
export type UserUpdate = Update<UserRow>;

// household_members ------------------------------------------------------

export interface HouseholdMemberRow {
  id: string;
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  created_at: string;
}
export type HouseholdMemberInsert = Insert<HouseholdMemberRow, "id" | "role" | "created_at">;
export type HouseholdMemberUpdate = Update<HouseholdMemberRow>;

// household_invites -------------------------------------------------------

export type HouseholdInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface HouseholdInviteRow {
  id: string;
  household_id: string;
  invited_email: string;
  role: HouseholdRole;
  invited_by_user_id: string;
  token: string;
  status: HouseholdInviteStatus;
  accepted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}
export type HouseholdInviteInsert = Insert<
  HouseholdInviteRow,
  "id" | "token" | "status" | "accepted_by_user_id" | "created_at" | "updated_at" | "expires_at"
>;
export type HouseholdInviteUpdate = Update<HouseholdInviteRow>;

export interface HouseholdInvitePreview {
  household_name: string;
  invited_email: string;
  inviter_name: string;
  role: HouseholdRole;
  status: HouseholdInviteStatus;
  expires_at: string;
}

// household_links -----------------------------------------------------

export interface HouseholdLinkRow {
  id: string;
  household_a_id: string;
  household_b_id: string;
  link_type: HouseholdLinkType;
  status: HouseholdLinkStatus;
  created_at: string;
  updated_at: string;
}
export type HouseholdLinkInsert = Insert<
  HouseholdLinkRow,
  "id" | "link_type" | "status" | "created_at" | "updated_at"
>;
export type HouseholdLinkUpdate = Update<HouseholdLinkRow>;

// people — THE SPINE -----------------------------------------------------

export type PersonGender = "female" | "male" | "non_binary" | "prefer_not_to_say";

export interface PersonRow {
  id: string;
  household_id: string;
  user_id: string | null;
  full_name: string;
  nickname: string | null;
  relationship_type: RelationshipType;
  // D-162: optional, skippable -- null means "not specified", never
  // defaulted or inferred. Especially important for children, per the
  // privacy sensitivity flagged in QUEUE-040.
  gender: PersonGender | null;
  birthdate: string | null;
  birth_year_known: boolean;
  anniversary: string | null;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  notes: string;
  is_archived: boolean;
  // D-060: childcare provider tagging + optional address for drive-time
  // estimates on childcare requests (see childcare_requests below).
  is_childcare_provider: boolean;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  // D-068: opt-in per-person toggle for whether this person's work_schedules
  // occurrences render on the main /calendar view. Defaults false; true for
  // "self" via migration backfill. The /calendar/custody co-parent-schedule
  // section deliberately ignores this flag.
  show_work_schedule_on_calendar: boolean;
  created_at: string;
  updated_at: string;
}
export type PersonInsert = Insert<
  PersonRow,
  | "id"
  | "user_id"
  | "nickname"
  | "gender"
  | "birthdate"
  | "birth_year_known"
  | "anniversary"
  | "phone"
  | "email"
  | "photo_url"
  | "notes"
  | "is_archived"
  | "is_childcare_provider"
  | "address"
  | "address_lat"
  | "address_lng"
  | "show_work_schedule_on_calendar"
  | "created_at"
  | "updated_at"
>;
export type PersonUpdate = Update<PersonRow>;

// childcare_requests (D-060) --------------------------------------------

export type ChildcareRequestStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

export interface ChildcareRequestRow {
  id: string;
  household_id: string;
  requested_by_person_id: string;
  provider_person_id: string;
  child_person_ids: string[];
  care_date: string;
  care_start_time: string;
  care_end_time: string;
  event_title: string | null;
  custom_note: string | null;
  status: ChildcareRequestStatus;
  token: string;
  drive_minutes_to_provider: number | null;
  drive_time_source: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}
export type ChildcareRequestInsert = Insert<
  ChildcareRequestRow,
  | "id"
  | "child_person_ids"
  | "event_title"
  | "custom_note"
  | "status"
  | "token"
  | "drive_minutes_to_provider"
  | "drive_time_source"
  | "responded_at"
  | "created_at"
  | "updated_at"
>;
export type ChildcareRequestUpdate = Update<ChildcareRequestRow>;

// Shape returned by the get_childcare_request_preview() RPC — deliberately
// narrower than ChildcareRequestRow (no household_id or person ids), same
// intent as HouseholdInvitePreview below: safe to show an unauthenticated
// visitor who followed the emailed accept/decline link.
export interface ChildcareRequestPreview {
  household_name: string;
  requester_name: string;
  provider_name: string;
  child_names: string[];
  care_date: string;
  care_start_time: string;
  care_end_time: string;
  event_title: string | null;
  custom_note: string | null;
  status: ChildcareRequestStatus;
  expires_at: string;
  drive_minutes_to_provider: number | null;
}

// person_interests ------------------------------------------------------

export interface PersonInterestRow {
  id: string;
  person_id: string;
  interest: string;
  category: string | null;
  strength: InterestStrength;
  source: InterestSource;
  noted_at: string;
  created_at: string;
  updated_at: string;
}
export type PersonInterestInsert = Insert<
  PersonInterestRow,
  "id" | "category" | "strength" | "source" | "noted_at" | "created_at" | "updated_at"
>;
export type PersonInterestUpdate = Update<PersonInterestRow>;

// person_gift_sites (D-063) ----------------------------------------------

export interface PersonGiftSiteRow {
  id: string;
  person_id: string;
  label: string;
  url: string;
  created_at: string;
  updated_at: string;
}
export type PersonGiftSiteInsert = Insert<PersonGiftSiteRow, "id" | "created_at" | "updated_at">;
export type PersonGiftSiteUpdate = Update<PersonGiftSiteRow>;

// work_schedules (D-064) --------------------------------------------------

export interface WorkScheduleRow {
  id: string;
  person_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  label: string;
  created_at: string;
  updated_at: string;
}
export type WorkScheduleInsert = Insert<WorkScheduleRow, "id" | "created_at" | "updated_at">;
export type WorkScheduleUpdate = Update<WorkScheduleRow>;

// time_off_entries (D-064) -------------------------------------------------

export interface TimeOffEntryRow {
  id: string;
  person_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  // D-135: optional trip destination (e.g. "Los Angeles, CA"). Null for an
  // ordinary local time-off entry with no travel-specific meaning.
  destination: string | null;
  source: "manual" | "quick_capture";
  created_at: string;
  updated_at: string;
}
export type TimeOffEntryInsert = Insert<TimeOffEntryRow, "id" | "created_at" | "updated_at">;
export type TimeOffEntryUpdate = Update<TimeOffEntryRow>;

// child_activities / child_activity_attendance (D-129) ---------------------

export interface ChildActivityRow {
  id: string;
  household_id: string;
  child_person_id: string;
  name: string;
  activity_type: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location_name: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  drive_time_minutes: number | null;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type ChildActivityInsert = Insert<
  ChildActivityRow,
  | "id"
  | "activity_type"
  | "location_name"
  | "location_address"
  | "location_lat"
  | "location_lng"
  | "drive_time_minutes"
  | "notes"
  | "is_active"
  | "created_at"
  | "updated_at"
>;
export type ChildActivityUpdate = Update<ChildActivityRow>;

export interface ChildActivityAttendanceRow {
  id: string;
  child_activity_id: string;
  person_id: string;
  attendance_status: AttendanceStatus;
  created_at: string;
  updated_at: string;
}
export type ChildActivityAttendanceInsert = Insert<
  ChildActivityAttendanceRow,
  "id" | "attendance_status" | "created_at" | "updated_at"
>;
export type ChildActivityAttendanceUpdate = Update<ChildActivityAttendanceRow>;

// person_gift_budgets ---------------------------------------------------

export interface PersonGiftBudgetRow {
  id: string;
  person_id: string;
  occasion_type: OccasionType;
  min_cents: number;
  max_cents: number;
  created_at: string;
  updated_at: string;
}
export type PersonGiftBudgetInsert = Insert<
  PersonGiftBudgetRow,
  "id" | "occasion_type" | "created_at" | "updated_at"
>;
export type PersonGiftBudgetUpdate = Update<PersonGiftBudgetRow>;

// gifts -----------------------------------------------------------------

export interface GiftRow {
  id: string;
  person_id: string;
  given_by_person_id: string | null;
  occasion_type: OccasionType;
  occasion_date: string;
  description: string;
  category: string | null;
  cost_cents: number | null;
  status: GiftStatus;
  reaction: GiftReaction | null;
  product_url: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}
export type GiftInsert = Insert<
  GiftRow,
  | "id"
  | "given_by_person_id"
  | "category"
  | "cost_cents"
  | "status"
  | "reaction"
  | "product_url"
  | "notes"
  | "created_at"
  | "updated_at"
>;
export type GiftUpdate = Update<GiftRow>;

// gift_suggestions ---------------------------------------------------

export interface GiftSuggestionRow {
  id: string;
  person_id: string;
  occasion_type: OccasionType;
  occasion_date: string;
  title: string;
  reasoning: string;
  price_tier: PriceTier;
  estimated_cost_cents: number;
  /** Shipping-window category (Section 7.3/7.4) — see migration 20260820000015. */
  category: string | null;
  product_url: string | null;
  retailer: string | null;
  order_by_date: string;
  status: SuggestionStatus;
  generated_at: string;
  model_version: string;
  /**
   * Module 1 (D-117, relationship_gift_engine_v2 flag): the brief's finer
   * idea->shortlisted->decided->ordered->shipped->arrived->given pipeline.
   * Purely additive alongside `status`, which stays the single source of
   * truth for existing behavior — see migration
   * 20260901000002_module1_relationship_gift_engine.sql.
   */
  pipeline_stage: GiftPipelineStage | null;
}
export type GiftSuggestionInsert = Insert<
  GiftSuggestionRow,
  "id" | "category" | "product_url" | "retailer" | "status" | "generated_at" | "pipeline_stage"
>;
export type GiftSuggestionUpdate = Update<GiftSuggestionRow>;

// contact_cadences ------------------------------------------------------

export interface ContactCadenceRow {
  id: string;
  person_id: string;
  target_interval_days: number;
  last_contact_date: string | null;
  last_contact_type: ContactType | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type ContactCadenceInsert = Insert<
  ContactCadenceRow,
  | "id"
  | "last_contact_date"
  | "last_contact_type"
  | "is_active"
  | "created_at"
  | "updated_at"
>;
export type ContactCadenceUpdate = Update<ContactCadenceRow>;

// interactions -----------------------------------------------------------

export interface InteractionRow {
  id: string;
  person_id: string;
  interaction_type: ContactType;
  occurred_on: string;
  notes: string | null;
  activity_id: string | null;
  created_at: string;
}
export type InteractionInsert = Insert<
  InteractionRow,
  "id" | "notes" | "activity_id" | "created_at"
>;
export type InteractionUpdate = Update<InteractionRow>;

// user_activities ------------------------------------------------------

export interface UserActivityRow {
  id: string;
  household_id: string;
  person_id: string;
  activity_type: string;
  enjoyment_rank: number;
  typical_duration_minutes: number;
  requires_prep: boolean;
  prep_lead_time_hours: number | null;
  preferred_companions: string[];
  // D-059: drive-time willingness for this activity. `typical_drive_minutes`
  // is the normal max for a routine outing; `big_trip_max_drive_minutes` is
  // how far the person would go for an exceptional/once-in-a-while outing
  // (e.g. a specifically great fishing spot worth the extra drive).
  typical_drive_minutes: number | null;
  big_trip_max_drive_minutes: number | null;
  // D-083 (P3-1): date-only -- see the migration comment for why.
  last_done_at: string | null;
  // D-085 (P3-3): season window (1-12, inclusive, wrap-around allowed) --
  // both null means year-round. needs_daylight gates on sunrise/sunset
  // overlap instead of the fixed waking-hours window. See
  // lib/planner/seasonality.ts.
  season_start_month: number | null;
  season_end_month: number | null;
  needs_daylight: boolean;
  // D-131: how long the prep itself takes, distinct from
  // prep_lead_time_hours (when before the event prep starts). Nullable —
  // most rows predate this column; the weekend-plan accept flow falls
  // back to a default duration when null.
  prep_duration_minutes: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type UserActivityInsert = Insert<
  UserActivityRow,
  | "id"
  | "requires_prep"
  | "prep_lead_time_hours"
  | "preferred_companions"
  | "typical_drive_minutes"
  | "big_trip_max_drive_minutes"
  | "last_done_at"
  | "season_start_month"
  | "season_end_month"
  | "needs_daylight"
  | "prep_duration_minutes"
  | "is_active"
  | "created_at"
  | "updated_at"
>;
export type UserActivityUpdate = Update<UserActivityRow>;

// trip_ideas -------------------------------------------------------------
// D-059: someday/bucket-list bigger trips (e.g. "Alaska fishing trip"),
// separate from routine UserActivityRow entries since they carry a target
// timeframe and companion picker rather than a recurring cadence.

export interface TripIdeaRow {
  id: string;
  household_id: string;
  created_by_person_id: string;
  title: string;
  activity_type: string | null;
  description: string | null;
  target_timeframe: string | null;
  companion_person_ids: string[];
  status: "idea" | "planned" | "booked" | "done" | "abandoned";
  created_at: string;
  updated_at: string;
}
export type TripIdeaInsert = Insert<
  TripIdeaRow,
  | "id"
  | "activity_type"
  | "description"
  | "target_timeframe"
  | "companion_person_ids"
  | "status"
  | "created_at"
  | "updated_at"
>;
export type TripIdeaUpdate = Update<TripIdeaRow>;

// opportunities ------------------------------------------------------
// D-061: rows detected by lib/opportunities/detect.ts — an activity or trip
// idea whose forecast for a specific upcoming date scored exceptionally
// well AND had enough open calendar time to actually be done.

export type OpportunityType = "activity_window" | "trip_idea_window";
export type OpportunityStatus = "open" | "dismissed" | "acted_on";

export interface OpportunityRow {
  id: string;
  household_id: string;
  activity_id: string | null;
  trip_idea_id: string | null;
  opportunity_type: OpportunityType;
  for_date: string;
  score: number;
  headline: string;
  reasoning: string;
  status: OpportunityStatus;
  detected_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  // Module 2 (leisure_planner_v2, D-118): the 5-component weighted score
  // breakdown from lib/planner/scoring.ts's ActivityScoreResult, persisted
  // only when the flag is on -- see resolveOpportunityScoreBreakdown().
  // Null on every pre-existing row and on every row written with the flag
  // off, by construction.
  score_breakdown: Record<string, number> | null;
}
export type OpportunityInsert = Insert<
  OpportunityRow,
  "id" | "activity_id" | "trip_idea_id" | "status" | "detected_at" | "created_at" | "updated_at" | "score_breakdown"
>;
export type OpportunityUpdate = Update<OpportunityRow>;

// activity_locations ------------------------------------------------

export interface ActivityLocationRow {
  id: string;
  user_activity_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  drive_time_minutes: number | null;
  notes: string;
  external_ids: Record<string, string>;
  created_at: string;
  updated_at: string;
}
export type ActivityLocationInsert = Insert<
  ActivityLocationRow,
  | "id"
  | "address"
  | "lat"
  | "lng"
  | "drive_time_minutes"
  | "notes"
  | "external_ids"
  | "created_at"
  | "updated_at"
>;
export type ActivityLocationUpdate = Update<ActivityLocationRow>;

// calendar_events ------------------------------------------------------

export interface CalendarEventRow {
  id: string;
  household_id: string;
  created_by_person_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  location_lat: number | null;
  location_lng: number | null;
  travel_time_before_minutes: number | null;
  prep_time_before_minutes: number | null;
  event_type: CalendarEventType;
  visibility: EventVisibility;
  external_source: string | null;
  external_id: string | null;
  /** The user_activity this event is an instance of, if any (Section 8.5 prep-event generation). */
  related_activity_id: string | null;
  /** Module 4 two-way sync round-trip identity (nullable additive columns, D-120). Null for every pre-existing/unsynced event. */
  synced_to_account_id: string | null;
  external_caldav_href: string | null;
  external_caldav_etag: string | null;
  created_at: string;
  updated_at: string;
}
export type CalendarEventInsert = Insert<
  CalendarEventRow,
  | "id"
  | "description"
  | "all_day"
  | "location"
  | "location_lat"
  | "location_lng"
  | "travel_time_before_minutes"
  | "prep_time_before_minutes"
  | "event_type"
  | "visibility"
  | "external_source"
  | "external_id"
  | "related_activity_id"
  | "synced_to_account_id"
  | "external_caldav_href"
  | "external_caldav_etag"
  | "created_at"
  | "updated_at"
>;
export type CalendarEventUpdate = Update<CalendarEventRow>;

// calendar_feeds ---------------------------------------------------------

export type CalendarFeedSyncStatus = "never" | "ok" | "error";

export interface CalendarFeedRow {
  id: string;
  household_id: string;
  created_by_person_id: string;
  label: string;
  feed_url: string;
  last_synced_at: string | null;
  last_sync_status: CalendarFeedSyncStatus;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}
export type CalendarFeedInsert = Insert<
  CalendarFeedRow,
  | "id"
  | "last_synced_at"
  | "last_sync_status"
  | "last_sync_error"
  | "created_at"
  | "updated_at"
>;
export type CalendarFeedUpdate = Update<CalendarFeedRow>;

// event_attendees ------------------------------------------------------

export interface EventAttendeeRow {
  id: string;
  calendar_event_id: string;
  person_id: string;
  attendance_status: AttendanceStatus;
}
export type EventAttendeeInsert = Insert<EventAttendeeRow, "id" | "attendance_status">;
export type EventAttendeeUpdate = Update<EventAttendeeRow>;

// custody_blocks --------------------------------------------------------

export interface CustodyBlockRow {
  id: string;
  household_id: string;
  child_person_id: string;
  responsible_person_id: string;
  starts_at: string;
  ends_at: string;
  block_type: CustodyBlockType;
  notes: string;
  location: string | null;
  custody_schedule_id: string | null;
  created_at: string;
  updated_at: string;
}
export type CustodyBlockInsert = Insert<
  CustodyBlockRow,
  "id" | "block_type" | "notes" | "location" | "custody_schedule_id" | "created_at" | "updated_at"
>;
export type CustodyBlockUpdate = Update<CustodyBlockRow>;

// custody_schedules ---------------------------------------------------

export interface CustodyCycleAssignment {
  dayIndex: number;
  responsiblePersonId: string;
}

// A day-of-week + clock-time breakpoint for the 'weekly_segments'
// recurrence type (migration 20260902000001). dayOfWeek is 0=Sunday..
// 6=Saturday, matching date-fns getDay(). Between any two consecutive
// breakpoints (sorted by dayOfWeek+time, wrapping across the week), the
// earlier breakpoint's person has custody -- see
// lib/custody/schedule.ts projectWeeklySegmentSchedule.
export interface CustodyWeeklySegment {
  dayOfWeek: number;
  time: string; // "HH:MM"
  responsiblePersonId: string;
}

export type CustodyRecurrenceType = "cycle" | "weekly_segments";

export interface CustodyScheduleRow {
  id: string;
  household_id: string;
  child_person_id: string;
  name: string;
  recurrence_type: CustodyRecurrenceType;
  // 'cycle' recurrence fields -- null when recurrence_type is 'weekly_segments'.
  cycle_length_days: number | null;
  cycle_assignments: CustodyCycleAssignment[] | null;
  anchor_date: string | null;
  handover_time: string;
  handover_location: string | null;
  // Optional per-cycle-dayIndex handover time override, keyed by dayIndex
  // as a string ("0", "1", ...) -> "HH:MM". null/absent dayIndex falls
  // back to handover_time. See migration 20260830000001. Only meaningful
  // for 'cycle' schedules.
  custom_handover_times: Record<string, string> | null;
  // 'weekly_segments' recurrence field -- null when recurrence_type is 'cycle'.
  weekly_segments: CustodyWeeklySegment[] | null;
  start_date: string;
  end_date: string | null;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type CustodyScheduleInsert = Insert<
  CustodyScheduleRow,
  | "id"
  | "name"
  | "recurrence_type"
  | "cycle_length_days"
  | "cycle_assignments"
  | "anchor_date"
  | "handover_time"
  | "handover_location"
  | "custom_handover_times"
  | "weekly_segments"
  | "end_date"
  | "notes"
  | "is_active"
  | "created_at"
  | "updated_at"
>;
export type CustodyScheduleUpdate = Update<CustodyScheduleRow>;

// custody_schedule_exceptions -------------------------------------------

export interface CustodyScheduleExceptionRow {
  id: string;
  custody_schedule_id: string;
  exception_date: string;
  responsible_person_id: string;
  reason: string;
  created_at: string;
}
export type CustodyScheduleExceptionInsert = Insert<
  CustodyScheduleExceptionRow,
  "id" | "reason" | "created_at"
>;
export type CustodyScheduleExceptionUpdate = Update<CustodyScheduleExceptionRow>;

// briefs ------------------------------------------------------------------

export interface BriefRow {
  id: string;
  household_id: string;
  for_person_id: string;
  brief_date: string;
  content_json: unknown;
  content_markdown: string;
  delivered_channels: string[];
  generated_at: string;
  opened_at: string | null;
}
export type BriefInsert = Insert<
  BriefRow,
  "id" | "delivered_channels" | "generated_at" | "opened_at"
>;
export type BriefUpdate = Update<BriefRow>;

// external_data_cache -------------------------------------------------

export interface ExternalDataCacheRow {
  id: string;
  source: string;
  cache_key: string;
  payload: unknown;
  fetched_at: string;
  expires_at: string;
}
export type ExternalDataCacheInsert = Insert<ExternalDataCacheRow, "id" | "fetched_at">;
export type ExternalDataCacheUpdate = Update<ExternalDataCacheRow>;

// ai_usage_log -----------------------------------------------------------

export interface AiUsageLogRow {
  id: string;
  household_id: string;
  feature: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_cents: number;
  created_at: string;
}
export type AiUsageLogInsert = Insert<AiUsageLogRow, "id" | "created_at">;

// device_tokens -----------------------------------------------------------

export interface DeviceTokenRow {
  id: string;
  user_id: string;
  platform: "ios" | "android" | "web";
  token: string;
  created_at: string;
}
export type DeviceTokenInsert = Insert<DeviceTokenRow, "id" | "created_at">;

// notifications -----------------------------------------------------------

export interface NotificationRow {
  id: string;
  household_id: string;
  person_id: string;
  notification_type: string;
  title: string;
  body: string;
  link_path: string | null;
  channels: NotificationChannel[];
  read_at: string | null;
  created_at: string;
}
export type NotificationInsert = Insert<
  NotificationRow,
  "id" | "link_path" | "channels" | "read_at" | "created_at"
>;
export type NotificationUpdate = Update<NotificationRow>;

// weekend_plans -----------------------------------------------------------

export interface WeekendPlanRow {
  id: string;
  household_id: string;
  for_date: string;
  content_json: unknown;
  content_markdown: string;
  generated_at: string;
  model_version: string;
  // D-131: the structured form of whichever candidate content_json's
  // narrated recommendation actually describes. Null when the AI's
  // recommendation is null (every candidate infeasible) or when regenerated
  // by a model_version that predates this column.
  recommended_activity_id: string | null;
  recommended_location_id: string | null;
  recommended_block_start: string | null;
  recommended_block_end: string | null;
  travel_minutes_each_way: number | null;
  // Idempotency guard for the one-click accept action.
  accepted_at: string | null;
  activity_calendar_event_id: string | null;
  prep_calendar_event_id: string | null;
}
export type WeekendPlanInsert = Insert<
  WeekendPlanRow,
  | "id"
  | "generated_at"
  | "recommended_activity_id"
  | "recommended_location_id"
  | "recommended_block_start"
  | "recommended_block_end"
  | "travel_minutes_each_way"
  | "accepted_at"
  | "activity_calendar_event_id"
  | "prep_calendar_event_id"
>;
export type WeekendPlanUpdate = Update<WeekendPlanRow>;

// brain_dump_batches -------------------------------------------------------

export type BrainDumpParseStatus = "pending" | "ready" | "unavailable" | "error";

export interface BrainDumpBatchRow {
  id: string;
  household_id: string;
  created_by_person_id: string;
  transcript: string;
  parse_status: BrainDumpParseStatus;
  parse_message: string | null;
  items: unknown;
  saved_count: number;
  created_at: string;
  updated_at: string;
}
export type BrainDumpBatchInsert = Insert<
  BrainDumpBatchRow,
  "id" | "parse_status" | "parse_message" | "items" | "saved_count" | "created_at" | "updated_at"
>;
export type BrainDumpBatchUpdate = Update<BrainDumpBatchRow>;

// gift_shipping_windows -------------------------------------------------

export interface GiftShippingWindowRow {
  category: string;
  label: string;
  shipping_window_days: number;
  description: string;
}

// feature_flags -----------------------------------------------------------
// Build Brief Additive Contract §3.2 -- see supabase/migrations/20260901000001_feature_flags.sql

export interface FeatureFlagRow {
  id: string;
  household_id: string;
  flag_key: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
export type FeatureFlagInsert = Insert<FeatureFlagRow, "id" | "enabled" | "created_at" | "updated_at">;
export type FeatureFlagUpdate = Update<FeatureFlagRow>;

// Module 1: Relationship & Gift Engine (D-117, relationship_gift_engine_v2 flag)
// -- see supabase/migrations/20260901000002_module1_relationship_gift_engine.sql

export type WishlistItemSource = "manual" | "conversation_log";
export type ConversationLogSource = "manual" | "overheard" | "inferred";
export type ReciprocityDirection = "given_to_them" | "received_from_them";

// person_profile_details ---------------------------------------------------

export interface PersonProfileDetailsRow {
  id: string;
  person_id: string;
  food_preferences: string | null;
  clothing_size: string | null;
  shoe_size: string | null;
  ring_size: string | null;
  preferred_brands: string | null;
  how_we_met: string | null;
  created_at: string;
  updated_at: string;
}
export type PersonProfileDetailsInsert = Insert<PersonProfileDetailsRow, "id" | "created_at" | "updated_at">;
export type PersonProfileDetailsUpdate = Update<PersonProfileDetailsRow>;

// person_wishlist_items -----------------------------------------------------

export interface PersonWishlistItemRow {
  id: string;
  person_id: string;
  item: string;
  source: WishlistItemSource;
  noted_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type PersonWishlistItemInsert = Insert<
  PersonWishlistItemRow,
  "id" | "source" | "noted_at" | "is_active" | "created_at" | "updated_at"
>;
export type PersonWishlistItemUpdate = Update<PersonWishlistItemRow>;

// person_relationships -------------------------------------------------------

// D-162: closed set matching people.relationship_type's vocabulary
// (minus 'self', which doesn't apply to a relation between two people),
// enforced by a check constraint (see the D-162 migration) rather than
// unrestricted free text.
export type RelationLabel =
  | "spouse"
  | "partner"
  | "child"
  | "co_parent"
  | "parent"
  | "sibling"
  | "extended_family"
  | "friend"
  | "colleague"
  | "other";

export interface PersonRelationshipRow {
  id: string;
  person_id: string;
  related_person_id: string | null;
  related_name: string;
  relation_label: RelationLabel;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export type PersonRelationshipInsert = Insert<
  PersonRelationshipRow,
  "id" | "related_person_id" | "notes" | "created_at" | "updated_at"
>;
export type PersonRelationshipUpdate = Update<PersonRelationshipRow>;

// conversation_log_entries ---------------------------------------------------

export interface ConversationLogEntryRow {
  id: string;
  person_id: string;
  entry_date: string;
  content: string;
  source: ConversationLogSource;
  logged_by_person_id: string | null;
  created_at: string;
  updated_at: string;
}
export type ConversationLogEntryInsert = Insert<
  ConversationLogEntryRow,
  "id" | "entry_date" | "source" | "logged_by_person_id" | "created_at" | "updated_at"
>;
export type ConversationLogEntryUpdate = Update<ConversationLogEntryRow>;

// moments ---------------------------------------------------------------------

export interface MomentRow {
  id: string;
  household_id: string;
  title: string;
  occurred_on: string;
  place: string | null;
  notes: string | null;
  participant_person_ids: string[];
  created_by_person_id: string | null;
  created_at: string;
  updated_at: string;
}
export type MomentInsert = Insert<
  MomentRow,
  "id" | "place" | "notes" | "participant_person_ids" | "created_by_person_id" | "created_at" | "updated_at"
>;
export type MomentUpdate = Update<MomentRow>;

// gift_reciprocity_entries -----------------------------------------------------

export interface GiftReciprocityEntryRow {
  id: string;
  household_id: string;
  person_id: string;
  direction: ReciprocityDirection;
  description: string;
  occasion_type: OccasionType | null;
  occurred_on: string | null;
  is_promise: boolean;
  promise_due_date: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
}
export type GiftReciprocityEntryInsert = Insert<
  GiftReciprocityEntryRow,
  "id" | "occasion_type" | "occurred_on" | "is_promise" | "promise_due_date" | "fulfilled_at" | "created_at" | "updated_at"
>;
export type GiftReciprocityEntryUpdate = Update<GiftReciprocityEntryRow>;

// activity_type_viability_configs (Module 2, leisure_planner_v2, D-118) --------

export interface ActivityTypeViabilityConfigRow {
  id: string;
  household_id: string;
  activity_type_key: string;
  relevant_inputs: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export type ActivityTypeViabilityConfigInsert = Insert<
  ActivityTypeViabilityConfigRow,
  "id" | "relevant_inputs" | "notes" | "created_at" | "updated_at"
>;
export type ActivityTypeViabilityConfigUpdate = Update<ActivityTypeViabilityConfigRow>;

// gear_checklist_items (Module 2, leisure_planner_v2, D-118) ------------------

export interface GearChecklistItemRow {
  id: string;
  household_id: string;
  user_activity_id: string | null;
  activity_type_key: string | null;
  item_label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export type GearChecklistItemInsert = Insert<
  GearChecklistItemRow,
  "id" | "user_activity_id" | "activity_type_key" | "sort_order" | "created_at" | "updated_at"
>;
export type GearChecklistItemUpdate = Update<GearChecklistItemRow>;

// leisure_outing_logs (Module 2, leisure_planner_v2, D-118) -------------------

export interface LeisureOutingLogRow {
  id: string;
  household_id: string;
  user_activity_id: string;
  occurred_on: string;
  conditions_notes: string | null;
  companions_person_ids: string[];
  rating: number | null;
  notes: string | null;
  gear_items_packed: string[];
  moment_id: string | null;
  created_by_person_id: string | null;
  created_at: string;
  updated_at: string;
}
export type LeisureOutingLogInsert = Insert<
  LeisureOutingLogRow,
  | "id"
  | "conditions_notes"
  | "companions_person_ids"
  | "rating"
  | "notes"
  | "gear_items_packed"
  | "moment_id"
  | "created_by_person_id"
  | "created_at"
  | "updated_at"
>;
export type LeisureOutingLogUpdate = Update<LeisureOutingLogRow>;

// Module 3 (universal_intake_v2, D-119) --------------------------------

export interface IntakeDraftRow {
  id: string;
  household_id: string;
  created_by_person_id: string | null;
  source_type: "text" | "voice" | "ics" | "image" | "screenshot" | "pdf" | "email";
  parser_used: "generic" | "activity_schedule" | "school_flyer" | "ics";
  detected_record_type:
    | "calendar_event"
    | "gift_idea"
    | "person"
    | "moment"
    | "person_note"
    | "task"
    | "recipe"
    | "flight"
    | "ambiguous"
    | null;
  extracted_fields: Record<string, { value: unknown; confidence: number }>;
  overall_confidence: number | null;
  source_excerpt: string | null;
  status: "pending" | "needs_review" | "ready" | "converted" | "rejected";
  review_note: string | null;
  converted_table: string | null;
  converted_record_id: string | null;
  parsed_at: string;
  created_at: string;
  updated_at: string;
}
export type IntakeDraftInsert = Insert<
  IntakeDraftRow,
  | "id"
  | "created_by_person_id"
  | "parser_used"
  | "detected_record_type"
  | "extracted_fields"
  | "overall_confidence"
  | "source_excerpt"
  | "status"
  | "review_note"
  | "converted_table"
  | "converted_record_id"
  | "parsed_at"
  | "created_at"
  | "updated_at"
>;
export type IntakeDraftUpdate = Update<IntakeDraftRow>;

export interface ActionLogRow {
  id: string;
  household_id: string;
  actor: "ai" | "system";
  feature: string;
  action_summary: string;
  read_summary: Record<string, unknown>;
  decision_summary: string | null;
  table_name: string;
  record_id: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  undoable: boolean;
  undone_at: string | null;
  created_at: string;
}
export type ActionLogInsert = Insert<
  ActionLogRow,
  "id" | "actor" | "read_summary" | "decision_summary" | "record_id" | "before_snapshot" | "after_snapshot" | "undoable" | "undone_at" | "created_at"
>;
export type ActionLogUpdate = Update<ActionLogRow>;

// household_scheduling_preferences (Module 4, D-120) --------------------

export interface PreferredActivityWindow {
  dayOfWeek: number; // 0=Sunday .. 6=Saturday
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface HouseholdSchedulingPreferencesRow {
  id: string;
  household_id: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  response_priority_person_ids: string[];
  brief_framing: "concise" | "balanced" | "detailed" | "encouraging";
  preferred_activity_windows: PreferredActivityWindow[];
  schedule_review_cadence_days: number | null;
  created_at: string;
  updated_at: string;
}
export type HouseholdSchedulingPreferencesInsert = Insert<
  HouseholdSchedulingPreferencesRow,
  | "id"
  | "quiet_hours_start"
  | "quiet_hours_end"
  | "response_priority_person_ids"
  | "brief_framing"
  | "preferred_activity_windows"
  | "schedule_review_cadence_days"
  | "created_at"
  | "updated_at"
>;
export type HouseholdSchedulingPreferencesUpdate = Update<HouseholdSchedulingPreferencesRow>;

// calendar_sync_accounts (Module 4, D-120) -------------------------------

export type CalendarSyncProvider = "apple_icloud" | "outlook_caldav" | "google";
export type CalendarSyncDirection = "pull_only" | "two_way";
export type CalendarSyncStatus = "never" | "ok" | "error";

export interface CalendarSyncAccountRow {
  id: string;
  household_id: string;
  created_by_person_id: string;
  provider: CalendarSyncProvider;
  label: string;
  caldav_server_url: string | null;
  caldav_username: string | null;
  caldav_app_password_ciphertext: string | null;
  caldav_app_password_iv: string | null;
  caldav_app_password_auth_tag: string | null;
  caldav_calendar_href: string | null;
  oauth_access_token_ciphertext: string | null;
  oauth_refresh_token_ciphertext: string | null;
  oauth_token_expires_at: string | null;
  sync_direction: CalendarSyncDirection;
  last_pull_at: string | null;
  last_pull_status: CalendarSyncStatus;
  last_pull_error: string | null;
  last_push_at: string | null;
  last_push_status: CalendarSyncStatus;
  last_push_error: string | null;
  created_at: string;
  updated_at: string;
}
export type CalendarSyncAccountInsert = Insert<
  CalendarSyncAccountRow,
  | "id"
  | "caldav_server_url"
  | "caldav_username"
  | "caldav_app_password_ciphertext"
  | "caldav_app_password_iv"
  | "caldav_app_password_auth_tag"
  | "caldav_calendar_href"
  | "oauth_access_token_ciphertext"
  | "oauth_refresh_token_ciphertext"
  | "oauth_token_expires_at"
  | "sync_direction"
  | "last_pull_at"
  | "last_pull_status"
  | "last_pull_error"
  | "last_push_at"
  | "last_push_status"
  | "last_push_error"
  | "created_at"
  | "updated_at"
>;
export type CalendarSyncAccountUpdate = Update<CalendarSyncAccountRow>;

// Module 6: Execution (draft-only) scaffold (D-122, execution_draft_only flag)
// -------------------------------------------------------------------------

export type ExecutionCategory = "rsvp" | "reschedule" | "confirmation" | "gift_order";

export interface ExecutionCategoryRow {
  id: string;
  household_id: string;
  category: ExecutionCategory;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
export type ExecutionCategoryInsert = Insert<ExecutionCategoryRow, "id" | "enabled" | "created_at" | "updated_at">;
export type ExecutionCategoryUpdate = Update<ExecutionCategoryRow>;

export type ExecutionAutonomyTier = "draft_only" | "send_with_approval" | "send_autonomously";

export interface ContactExecutionSettingsRow {
  id: string;
  household_id: string;
  person_id: string;
  autonomy_tier: ExecutionAutonomyTier;
  is_business_contact: boolean;
  created_at: string;
  updated_at: string;
}
export type ContactExecutionSettingsInsert = Insert<
  ContactExecutionSettingsRow,
  "id" | "autonomy_tier" | "is_business_contact" | "created_at" | "updated_at"
>;
export type ContactExecutionSettingsUpdate = Update<ContactExecutionSettingsRow>;

export type ExecutionDraftSourceType = "manual" | "templated" | "inbound_email";
export type ExecutionDraftStatus = "pending_review" | "approved" | "discarded";

export interface ExecutionDraftRow {
  id: string;
  household_id: string;
  category: ExecutionCategory;
  contact_person_id: string | null;
  source_type: ExecutionDraftSourceType;
  source_reference: string | null;
  draft_subject: string | null;
  draft_body: string;
  status: ExecutionDraftStatus;
  reviewed_by_person_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}
export type ExecutionDraftInsert = Insert<
  ExecutionDraftRow,
  | "id"
  | "contact_person_id"
  | "source_type"
  | "source_reference"
  | "draft_subject"
  | "status"
  | "reviewed_by_person_id"
  | "reviewed_at"
  | "created_at"
  | "updated_at"
>;
export type ExecutionDraftUpdate = Update<ExecutionDraftRow>;

export interface AssistantEmailConfigRow {
  household_id: string;
  alias: string;
  created_at: string;
  updated_at: string;
}
export type AssistantEmailConfigInsert = Omit<AssistantEmailConfigRow, "created_at" | "updated_at">;
export type AssistantEmailConfigUpdate = Partial<Omit<AssistantEmailConfigRow, "household_id">>;

// Module 7: Household Layer (D-123, household_layer flag) -----------------
// Thin, purely defensive per the brief: meal planning + dietary
// preferences + pantry awareness, aisle-organized grocery lists, chores
// with assignment/completion, recipe capture via Module 3 intake.

export type DietaryRestriction =
  | "vegetarian"
  | "vegan"
  | "pescatarian"
  | "gluten_free"
  | "dairy_free"
  | "nut_allergy"
  | "shellfish_allergy"
  | "egg_allergy"
  | "low_carb"
  | "kosher"
  | "halal"
  | "other";

export interface DietaryPreferenceRow {
  id: string;
  household_id: string;
  person_id: string;
  restriction: DietaryRestriction;
  notes: string | null;
  created_at: string;
}
export type DietaryPreferenceInsert = Insert<DietaryPreferenceRow, "id" | "notes" | "created_at">;
export type DietaryPreferenceUpdate = Update<DietaryPreferenceRow>;

export type GroceryAisle =
  | "produce"
  | "dairy"
  | "meat_seafood"
  | "bakery"
  | "frozen"
  | "pantry"
  | "beverages"
  | "household"
  | "other";

export interface PantryItemRow {
  id: string;
  household_id: string;
  name: string;
  quantity: string | null;
  aisle: GroceryAisle;
  expires_on: string | null;
  created_by_person_id: string | null;
  created_at: string;
}
export type PantryItemInsert = Insert<
  PantryItemRow,
  "id" | "quantity" | "aisle" | "expires_on" | "created_by_person_id" | "created_at"
>;
export type PantryItemUpdate = Update<PantryItemRow>;

export interface RecipeRow {
  id: string;
  household_id: string;
  created_by_person_id: string | null;
  title: string;
  ingredients: string;
  instructions: string | null;
  servings: number | null;
  source_url: string | null;
  created_at: string;
}
export type RecipeInsert = Insert<
  RecipeRow,
  "id" | "created_by_person_id" | "instructions" | "servings" | "source_url" | "created_at"
>;
export type RecipeUpdate = Update<RecipeRow>;

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealPlanRow {
  id: string;
  household_id: string;
  planned_date: string;
  meal_slot: MealSlot;
  recipe_id: string | null;
  custom_meal_name: string | null;
  created_by_person_id: string | null;
  created_at: string;
}
export type MealPlanInsert = Insert<
  MealPlanRow,
  "id" | "recipe_id" | "custom_meal_name" | "created_by_person_id" | "created_at"
>;
export type MealPlanUpdate = Update<MealPlanRow>;

export interface GroceryListRow {
  id: string;
  household_id: string;
  title: string;
  generated_from_meal_plan: boolean;
  created_by_person_id: string | null;
  created_at: string;
}
export type GroceryListInsert = Insert<
  GroceryListRow,
  "id" | "generated_from_meal_plan" | "created_by_person_id" | "created_at"
>;
export type GroceryListUpdate = Update<GroceryListRow>;

export interface GroceryListItemRow {
  id: string;
  grocery_list_id: string;
  household_id: string;
  name: string;
  quantity: string | null;
  aisle: GroceryAisle;
  is_checked: boolean;
  source_recipe_id: string | null;
  created_at: string;
}
export type GroceryListItemInsert = Insert<
  GroceryListItemRow,
  "id" | "quantity" | "aisle" | "is_checked" | "source_recipe_id" | "created_at"
>;
export type GroceryListItemUpdate = Update<GroceryListItemRow>;

export type ChoreStatus = "open" | "done";

export interface ChoreRow {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  assigned_person_id: string | null;
  due_date: string | null;
  status: ChoreStatus;
  completed_by_person_id: string | null;
  completed_at: string | null;
  created_by_person_id: string | null;
  created_at: string;
  updated_at: string;
}
export type ChoreInsert = Insert<
  ChoreRow,
  | "id"
  | "description"
  | "assigned_person_id"
  | "due_date"
  | "status"
  | "completed_by_person_id"
  | "completed_at"
  | "created_by_person_id"
  | "created_at"
  | "updated_at"
>;
export type ChoreUpdate = Update<ChoreRow>;

// packing_lists / packing_list_items (D-139, packing_checklist_v2) --------

export type TripType =
  | "beach"
  | "city"
  | "camping"
  | "ski_snow"
  | "road_trip"
  | "visiting_family"
  | "international"
  | "business"
  | "other";

export type PackingListStatus = "active" | "archived";

export interface PackingListRow {
  id: string;
  household_id: string;
  created_by_person_id: string | null;
  title: string;
  trip_type: TripType;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  traveler_person_ids: string[];
  planned_activities: string | null;
  status: PackingListStatus;
  created_at: string;
  updated_at: string;
}
export type PackingListInsert = Insert<
  PackingListRow,
  | "id"
  | "created_by_person_id"
  | "trip_type"
  | "start_date"
  | "end_date"
  | "destination"
  | "traveler_person_ids"
  | "planned_activities"
  | "status"
  | "created_at"
  | "updated_at"
>;
export type PackingListUpdate = Update<PackingListRow>;

export type PackingListItemSource = "ai" | "manual";

export interface PackingListItemRow {
  id: string;
  household_id: string;
  packing_list_id: string;
  label: string;
  category: string | null;
  checked: boolean;
  sort_order: number;
  source: PackingListItemSource;
  created_at: string;
  updated_at: string;
}
export type PackingListItemInsert = Insert<
  PackingListItemRow,
  "id" | "category" | "checked" | "sort_order" | "source" | "created_at" | "updated_at"
>;
export type PackingListItemUpdate = Update<PackingListItemRow>;
