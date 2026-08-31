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

export interface PersonRow {
  id: string;
  household_id: string;
  user_id: string | null;
  full_name: string;
  nickname: string | null;
  relationship_type: RelationshipType;
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
  source: "manual" | "quick_capture";
  created_at: string;
  updated_at: string;
}
export type TimeOffEntryInsert = Insert<TimeOffEntryRow, "id" | "created_at" | "updated_at">;
export type TimeOffEntryUpdate = Update<TimeOffEntryRow>;

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
}
export type GiftSuggestionInsert = Insert<
  GiftSuggestionRow,
  "id" | "category" | "product_url" | "retailer" | "status" | "generated_at"
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
}
export type OpportunityInsert = Insert<
  OpportunityRow,
  "id" | "activity_id" | "trip_idea_id" | "status" | "detected_at" | "created_at" | "updated_at"
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

export interface CustodyScheduleRow {
  id: string;
  household_id: string;
  child_person_id: string;
  name: string;
  cycle_length_days: number;
  cycle_assignments: CustodyCycleAssignment[];
  anchor_date: string;
  handover_time: string;
  handover_location: string | null;
  // Optional per-cycle-dayIndex handover time override, keyed by dayIndex
  // as a string ("0", "1", ...) -> "HH:MM". null/absent dayIndex falls
  // back to handover_time. See migration 20260830000001.
  custom_handover_times: Record<string, string> | null;
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
  | "handover_time"
  | "handover_location"
  | "custom_handover_times"
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
}
export type WeekendPlanInsert = Insert<WeekendPlanRow, "id" | "generated_at">;
export type WeekendPlanUpdate = Update<WeekendPlanRow>;

// gift_shipping_windows -------------------------------------------------

export interface GiftShippingWindowRow {
  category: string;
  label: string;
  shipping_window_days: number;
  description: string;
}
