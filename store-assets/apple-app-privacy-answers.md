# Apple App Privacy ("nutrition label") — draft answers

Draft answers for the App Store Connect **App Privacy** questionnaire,
derived directly from LifeOS's actual data practices (same source as the
`/privacy` policy page, D-103). App Store Connect requires this
questionnaire to be filled in before a listing can be submitted — it
produces the public "App Privacy" label shown on the App Store listing
page.

**This is a first draft, not a substitute for Richard's own review.**
Apple holds the developer legally responsible for the accuracy of this
label; get it right before submitting, especially the "linked to identity"
and "used for tracking" columns below, which have real compliance
consequences if answered incorrectly.

## Does this app collect data?

**Yes.**

## Data types collected

| Apple data type | Collected? | What in LifeOS | Linked to identity? | Used for tracking? |
|---|---|---|---|---|
| **Contact Info — Name** | Yes | Household member names (self, co-parent, children, extended family, friends) that a user enters | Yes | No |
| **Contact Info — Email Address** | Yes | Account sign-in email; also collected transiently for childcare-request recipients who aren't LifeOS users | Yes | No |
| **User Content — Other User Content** | Yes | Calendar events, activities, gift ideas/notes, "brain dump" notes, custody schedule details | Yes | No |
| **Identifiers — User ID** | Yes | Internal account/household IDs (Supabase auth `user_id`, `household_id`) | Yes | No |
| **Usage Data** | No | No analytics/telemetry SDK is integrated (verify against `package.json` before submitting if this changes) | — | — |
| **Diagnostics** | No | No crash-reporting SDK is integrated today | — | — |
| **Location** | No | Activity/event "location" fields are free-text strings the user types (e.g. "Riverside Park"), not device GPS coordinates — this is **User Content**, not Apple's **Location** data type | — | — |
| **Financial Info, Health & Fitness, Browsing History, Search History, Purchases, Sensitive Info** | No | Not collected | — | — |

## Data use

For every collected type above, the purpose is **App Functionality** only
(showing the calendar/brief, generating AI suggestions, sending
user-triggered emails, keeping household data isolated). None of it is used
for **Third-Party Advertising**, **Developer's Advertising or Marketing**,
**Analytics**, or **Product Personalization** beyond the app's own features.

## Tracking

**No.** LifeOS does not track users across other companies' apps or
websites for advertising purposes (no ad SDK, no cross-app identifiers
shared with third parties). Answer "No" to Apple's tracking question and
skip the AppTrackingTransparency (ATT) prompt requirement.

## Third parties data is shared with

Matches the `/privacy` page (D-103) exactly — list these as the app's data
processors when the questionnaire asks who data is shared with:

- **Supabase** — database hosting and authentication
- **Anthropic (Claude API)** — AI feature generation, using placeholder-redacted content for children's names/locations
- **Resend** — transactional email delivery (invites, childcare requests)
- **Vercel** — application hosting

## Biometric app-lock (Face ID / Touch ID)

LifeOS optionally locks the app behind device Face ID/Touch ID on every
open (D-100). This does **not** add a row to the data-collection table
above: authentication happens entirely on-device via Apple's
`LocalAuthentication` framework, and the app only receives a yes/no
authentication result — it never receives, stores, or transmits any
biometric data itself. Apple's App Privacy questionnaire does not have a
data type for this because the app has no access to underlying biometric
data to disclose. Technical note: this requires the
`NSFaceIDUsageDescription` key in `Info.plist` (added — without it, Face
ID silently fails and Apple review would reject the build).

## Children's data note

Household data about children (custody schedules, activity locations) is
entered by a parent/guardian, not collected directly from a child — LifeOS
has no child-facing sign-in flow at all. This app is not "primarily directed
to children" under Apple's Kids Category rules, so the Kids Category privacy
requirements should not apply; if Richard intends to list under the Kids
Category (unlikely given the target audience is parents), this section would
need re-review.

## Before submitting

1. Re-check this table against `app/privacy/page.tsx` if that page changes.
2. If any analytics, crash reporting, or ad SDK is added later, this
   questionnaire (and the `/privacy` page) both need updating — they must
   stay in sync.
3. Richard should read Apple's own
   [App Privacy Details guidance](https://developer.apple.com/app-store/app-privacy-details/)
   once before submitting, since he is the accountable party for the label's
   accuracy, not this draft.
