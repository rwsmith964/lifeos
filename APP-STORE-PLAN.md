# LifeOS — App Store Launch Plan

Status: draft, prep started 2026-08-31. Not yet submitted anywhere. This
document is the working plan referenced by D-099 in DECISIONS.md.

## 1. Why a wrapper, and which kind

LifeOS is a server-rendered Next.js app (Server Actions, Supabase auth
cookies, dynamic per-household data) — it cannot be exported as a static
site, so a Capacitor "hosted" app is the right shape: the native shell's
WebView points `server.url` at the live production deployment
(`https://lifeos-seven-rho.vercel.app`) instead of bundling static assets.
Everything users see is still served fresh from Vercel/Supabase; the native
shell exists to (a) get a real app icon on the home screen and (b) host the
native plugins in §3 that a browser tab cannot provide.

`capacitor.config.ts` and the generated `ios/` Xcode project already exist
on the `capacitor-app-store-prep` branch (not yet merged to `main`).

## 2. The Guideline 4.2 risk, and how this plan addresses it

Apple's [App Store Review Guidelines §4.2](https://developer.apple.com/app-store/review/guidelines/)
("Minimum Functionality") routinely rejects apps that are "merely a
repackaged website" with no native capability. A plain Capacitor wrapper
with zero native plugins is a likely rejection.

Mitigation: ship with at least 2–3 real native features (below) wired
through Capacitor plugins, so the reviewer sees functionality a Safari tab
genuinely cannot provide, not just a WebView with an app icon.

## 3. Native features (native code, out of scope for this sandbox)

| Feature | Why it's a real 4.2 justification | Capacitor plugin |
|---|---|---|
| Push notifications | Custody handover reminders, gift-date alerts — LifeOS's core value ("never miss a gift") depends on proactive nudges a website tab can't send | `@capacitor/push-notifications` + Apple Push Notification service (APNs) cert |
| Face ID / biometric app-lock | Household data (kids' schedules, custody details) benefits from a device-level lock a browser can't offer | `@capacitor/biometric-auth` (community) or native `LAContext` via a small Swift plugin |
| Home-screen widget | "Today's brief" / "next handover" glanceable without opening the app — a genuinely native-only surface | WidgetKit (Swift, iOS 14+) — not a Capacitor plugin; written directly in the generated `ios/` Xcode project |

None of these can be built or tested in this Linux sandbox — they require
Xcode, a macOS build agent, and (for push) an Apple Developer account to
generate an APNs key. They are scoped here as a plan, not implemented.

## 4. What's already done here (sandbox-side prep)

- [x] `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` added as devDependencies
- [x] `capacitor.config.ts` created — app id `com.rwsmith.lifeos`, hosted mode pointing at production
- [x] `npx cap add ios` run successfully — generates `ios/App/App.xcodeproj` and supporting files
- [x] Typecheck still clean after these changes
- [ ] Actual Xcode build/archive/sign — **cannot happen here**, see §5

## 5. What requires a macOS environment (blocked here, needs Richard's next action)

Xcode only runs on macOS; Richard's own device is Windows. Options, cheapest
first:

1. **GitHub Actions macOS runner** — free tier includes macOS minutes; can
   run `xcodebuild` headlessly for CI builds and even TestFlight uploads via
   `fastlane`. Best fit since the repo is already on GitHub. No native UI
   needed for basic builds; needed only when actually testing push/biometric/
   widget code on-device (simulator is fine for that).
2. **Codemagic** or **Capawesome Cloud** — hosted CI built specifically for
   Capacitor/Flutter/RN apps; slightly friendlier setup than raw GH Actions
   macOS runners, small monthly cost above free tier.
3. **Borrow/rent a Mac** (e.g. MacinCloud, or a friend's machine) for the
   initial cert/provisioning-profile setup and manual Xcode Archive, if
   Richard prefers a one-time GUI pass over CI config.

Recommendation: start with GitHub Actions macOS runner since it's free and
the repo already lives there — revisit if the workflow proves too fiddly.

## 6. Costs and accounts (Richard's own, not delegable)

- **Apple Developer Program: $99/year**, individual tier, Richard's own
  Apple ID and payment method — [developer.apple.com/programs](https://developer.apple.com/programs/).
  This must be done by Richard personally; it is not something to complete
  on his behalf.
- No "Sign in with Apple" requirement — LifeOS uses email/password only, and
  Apple only mandates Sign in with Apple when a third-party social login
  (Google, Facebook, etc.) is offered without an Apple equivalent.

## 7. Store listing assets needed (not yet created)

- 1024×1024 App Store icon (no alpha, no rounded corners — Apple applies the mask)
- iPhone 6.9" screenshots, 1320×2868px, at least 3 per Apple's minimum
- Public privacy policy URL — repo has `docs/privacy.md`; needs to be hosted
  somewhere public (e.g. a route on the production Vercel deployment, or a
  simple static page) since App Store Connect requires a live URL, not a
  repo file
- Support URL — same hosting need as above
- Demo account credentials for the App Review team (can reuse Richard's own
  seeded household, or a dedicated review-only household — Richard's call)

## 8. Submission pipeline (once a macOS build path exists)

1. Create App ID + provisioning profile in Apple Developer portal (matches
   `com.rwsmith.lifeos`)
2. Xcode Archive (or `fastlane build` on CI) → upload to App Store Connect
3. Internal TestFlight build — Richard tests on his own iPhone first
4. Fill in App Store Connect listing (screenshots, description, privacy
   policy URL, support URL, demo credentials)
5. Submit for review — Apple's typical turnaround is 1–3 business days
6. Address any 4.2-style rejection by pointing reviewers to the native
   features in §3; have all three live in the build reviewers test, not just
   documented here

## 9. Open decisions for Richard

- Which native feature to build first — push notifications is the highest
  product value (matches "never miss a gift/handover") but needs an APNs
  key; biometric lock is technically simplest to ship first
- Whether to enroll in Apple Developer Program now (so the App ID and
  provisioning profile exist before any native feature work starts) or wait
  until at least one native feature is code-complete
- macOS build path: GitHub Actions runner vs. Codemagic vs. borrowed Mac (see §5)
