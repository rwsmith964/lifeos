# Google Play Data Safety form — draft answers

Draft answers for the Play Console **Data Safety** section, derived from
the same real data practices as `/privacy` (D-103) and the Apple App
Privacy draft (`apple-app-privacy-answers.md`) — kept consistent across
both stores since they describe the same app.

**This is a first draft for Richard's review before submission**, same
caveat as the Apple draft: Google holds the developer responsible for
label accuracy, and this form also gates the content rating flow.

## Does your app collect or share any of the required user data types?

**Yes, collects data.** No data is shared with anyone outside the four
processors below (data "sharing" in Play's specific sense — transferring
to a third party for their own purposes — does not apply here; Supabase,
Anthropic, Resend, and Vercel are processors acting on LifeOS's behalf
only, which Play Console has a separate "service provider" carve-out for).

## Data types

| Play category | Collected? | Shared? | Notes |
|---|---|---|---|
| **Personal info → Name** | Yes | No | Household member names |
| **Personal info → Email address** | Yes | No | Account sign-in; also transient for non-user childcare-request recipients |
| **Personal info → User IDs** | Yes | No | Internal Supabase auth/household IDs |
| **App activity → Other user-generated content** | Yes | No | Calendar events, activities, gift ideas, notes, custody details |
| **App activity → App interactions** | No | No | No analytics SDK integrated |
| **Device or other IDs** | No | No | No advertising/device identifiers collected |
| **Location** | No | No | Location fields are free-text user input, not device GPS |
| **Financial, Health, Messages, Photos/Videos, Audio, Files/docs, Calendar (device-level), Contacts, App info/performance, Web browsing** | No | No | Not collected |

## Is all of the user data collected by your app encrypted in transit?

**Yes** — all traffic is HTTPS (see `/privacy` "Security" section).

## Do you provide a way for users to request that their data be deleted?

**Yes** — via the contact email on the `/privacy` and `/support` pages
(`rwsmith964@gmail.com`). There is no in-app self-service delete flow yet;
if Play's form requires an in-app deletion path rather than an email
request, that would need a small feature addition before this can be
answered "yes" to that specific sub-question — flagging this as a possible
follow-up, not yet built.

## Biometric app-lock (fingerprint / face unlock)

Same note as the Apple draft: LifeOS's optional app-lock (D-100) uses
Android's `BiometricPrompt` API entirely on-device — the app receives
only a pass/fail result, never raw biometric data, so this is not a
collected data type under Play's taxonomy either. `USE_BIOMETRIC` (a
normal, automatically-granted permission) has been added to
`AndroidManifest.xml` to make this explicit rather than relying solely on
the androidx.biometric library's own manifest merge.

## Children's data

Same note as the Apple draft: data about children is parent-entered, not
collected from children directly, and there's no child-facing sign-in.
LifeOS is a family-organizer tool for parents, not an app "designed for
children" under Play's Families Policy — so it should be answered
accordingly. If Richard's target-audience answer in the separate Play
Console "Target audience" section includes children as a primary audience,
this section and the content rating below would need re-review.

## Content rating questionnaire (IARC) — recommendation, not filled in here

Google requires the developer to complete IARC's questionnaire directly in
Play Console (it can't be pre-filled from outside). Based on what LifeOS
actually does — no violence, no user-generated public content visible to
strangers, no gambling, no unmoderated chat with strangers, only
household-private data entered by adults about their own family — the
likely outcome across each region's system (ESRB/PEGI/etc.) is the lowest
tier (e.g. "Everyone" / "3+" / "PEGI 3"). This is a recommendation only;
Richard should complete the actual questionnaire himself in Play Console
since IARC assigns the final rating based on his own answers, not this
document.

## Before submitting

Keep this file, `apple-app-privacy-answers.md`, and `app/privacy/page.tsx`
in sync — if the app's data collection changes (e.g. analytics or push
notifications are added, see APP-STORE-PLAN.md §3), update all three.
