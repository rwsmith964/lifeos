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

## 3. Native features

| Feature | Why it's a real 4.2 justification | Capacitor plugin | Status |
|---|---|---|---|
| Face ID / biometric app-lock | Household data (kids' schedules, custody details) benefits from a device-level lock a browser can't offer | `@aparajita/capacitor-biometric-auth` + `@capacitor/app` | **Built (D-100).** `components/native/app-lock-gate.tsx`, no-ops outside the native shell. Real Face ID/Touch ID prompt still unverified — needs a simulator/device (§5). |
| Push notifications | Custody handover reminders, gift-date alerts — LifeOS's core value ("never miss a gift") depends on proactive nudges a website tab can't send | `@capacitor/push-notifications` + Apple Push Notification service (APNs) cert | Not started — needs an Apple Developer account for an APNs key first |
| Home-screen widget | "Today's brief" / "next handover" glanceable without opening the app — a genuinely native-only surface | WidgetKit (Swift, iOS 14+) — not a Capacitor plugin; written directly in the generated `ios/` Xcode project | Not started — needs Xcode/macOS |

Push notifications and the widget can't be built or tested in this Linux
sandbox — they require Xcode, a macOS build agent, and (for push) an Apple
Developer account to generate an APNs key. Biometric lock's application
code is done; only the native Info.plist/AndroidManifest permission entries
and real-device testing remain, and those also need Xcode/Android Studio
(§5).

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

## 7. Store listing assets needed

- [x] 1024×1024 App Store icon (no alpha, no rounded corners) — done in D-102,
  `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- [x] Public privacy policy URL — **done (D-103):** live at
  [lifeos-seven-rho.vercel.app/privacy](https://lifeos-seven-rho.vercel.app/privacy).
  First draft from the app's actual data practices; Richard should review
  before relying on it for a real submission.
- [x] Support URL — **done:** live at
  [lifeos-seven-rho.vercel.app/support](https://lifeos-seven-rho.vercel.app/support)
- [x] Play Store hi-res icon (512×512) and feature graphic (1024×500) — done,
  `store-assets/play-hi-res-icon-512.png` and
  `store-assets/play-feature-graphic-1024x500.png`, generated from the real
  brand mark
- [x] Draft store listing copy (Play short/full description, App Store
  subtitle/description/keywords/promo text) — done,
  `store-assets/store-listing-copy.md`. First draft, Richard's review needed
  before submission (it's public marketing copy, plus category/age-rating
  choices are his call).
- [ ] iPhone 6.9" screenshots, 1320×2868px, at least 3 per Apple's minimum —
  **blocked on a decision, see §14**
- [ ] Android phone (and optional 7"/10" tablet) screenshots — **blocked on
  the same decision, see §14**
- [ ] Demo account credentials for the App Review team (can reuse Richard's
  own seeded household, or a dedicated review-only household — Richard's
  call)

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

- Biometric app-lock is code-complete (D-100); push notifications is next
  in line for native features but needs an APNs key from an Apple Developer
  account first
- Whether to enroll in Apple Developer Program now (so the App ID and
  provisioning profile exist before any native feature work starts) or wait
  until at least one native feature is code-complete
- macOS build path: GitHub Actions runner vs. Codemagic vs. borrowed Mac (see §5)

## 10. Android / Google Play Store prep (D-102)

Unlike iOS, the Android toolchain (Gradle CLI, Android SDK command-line
tools, `aapt`, `apksigner`/`jarsigner`) runs headlessly on Linux, so this
sandbox could do real build/sign/verify work directly — no CI workaround
needed the way Xcode required one for iOS.

- [x] `npx cap add android` — generates the `android/` Gradle project,
  app id `com.rwsmith.lifeos` (matches iOS bundle id for consistency)
- [x] Android SDK command-line tools installed locally (`platform-tools`,
  `platforms;android-35`, `build-tools;35.0.0`)
- [x] JDK toolchain fixed — system default is OpenJDK 25, incompatible with
  this project's Gradle 8.14.3; pinned Gradle to OpenJDK 21 via
  `org.gradle.java.home` in `android/gradle.properties` rather than
  changing the system Node/tooling default
- [x] Debug APK builds successfully (`./gradlew assembleDebug`)
- [x] Release AAB builds successfully (`./gradlew bundleRelease`)
- [x] **Real app icon** — replaced the generic default Capacitor "blue X"
  icon with the actual LifeOS brand mark (black circle, white triangle) at
  every mipmap density, plus a matching adaptive-icon foreground/background
  pair, derived from `public/icon-512.png` / `icon-512-maskable.png`
- [x] **Branded splash screen** — replaced the default white
  Capacitor-logo splash with a black background + centered white triangle,
  generated at every density/orientation Capacitor ships
- [x] **Real release signing keystore generated** — `lifeos-release.keystore`
  (PKCS12, RSA 2048, 30-year validity), wired into
  `android/app/build.gradle` via a local `android/keystore.properties`
  file that is git-ignored (never committed — see §11). Verified with
  `jarsigner -verify` → `jar verified`, signer cert visible, not just a
  debug/auto-generated key.
- [x] Corrected an earlier inaccurate note in this plan: `USE_BIOMETRIC`
  and `USE_FINGERPRINT` permissions do **not** need a manual
  `AndroidManifest.xml` edit — `aapt dump badging` on the debug APK
  confirms both are already present, auto-merged in from the biometric
  plugin's own bundled manifest.
- [x] Public privacy policy URL (D-103) — live at
  [lifeos-seven-rho.vercel.app/privacy](https://lifeos-seven-rho.vercel.app/privacy),
  satisfies both this and the iOS requirement in §7
- [ ] Not yet done: feature graphic (1024×500), Play Console hi-res icon
  (512×512 — can reuse the same brand mark), phone + tablet screenshots,
  short/full store description, content rating questionnaire, target
  audience + Data Safety form
- [ ] Not yet done: real on-device/emulator testing (no Android emulator
  display in this sandbox — Gradle CLI builds are headless-verified only)

## 11. Android signing keystore — what Richard needs to do

The release keystore (`android/keystore-secure/lifeos-release.keystore`)
and its passwords are **deliberately excluded from git** — a signing key
leak in a public or even private repo history is permanent and
unrecoverable. That means this file only exists in this sandbox's
workspace and was shared with Richard directly; it is not preserved by
`git push`.

**Action required:** download the shared keystore file and its password
note, then store both somewhere durable and secure (a password manager,
an encrypted drive, etc.) — not just this chat. If this keystore is lost
before Play Console's "Play App Signing" is set up on first upload,
future app updates become impossible without going through Google's
key-loss recovery process, which requires identity verification and can
take days.

## 12. Google Play Console — cost and account (Richard's own, not delegable)

- **Google Play Console registration: one-time $25**, Richard's own
  Google account and payment method —
  [play.google.com/console/signup](https://play.google.com/console/signup/).
  Same rule as the Apple $99/year fee in §6: this must be done by Richard
  personally, not on his behalf.

## 13. Play Store submission pipeline (once Richard has a Play Console account)

1. Create the app listing in Play Console (package name `com.rwsmith.lifeos`)
2. Opt in to Play App Signing (Google re-signs the app for distribution;
   Richard's upload keystore from §10/§11 only signs the upload, not the
   final distributed APK)
3. Upload the signed release AAB to an Internal Testing track first —
   Richard tests on his own Android device before wider release
4. Fill in the Play Console listing: short/full description, hi-res icon,
   feature graphic, phone/tablet screenshots, privacy policy URL, content
   rating questionnaire, Data Safety form, target audience
5. Promote from Internal Testing → Production once verified

## 14. Open decisions for Richard (Android)

- Whether to register the Google Play Console account now (unlocks real
  upload/testing-track work) or wait until more store-listing assets
  (screenshots, descriptions) are ready
- Confirm receipt and secure backup of the release keystore (§11) before
  it's needed for a first Play Store upload
- **Screenshot data source (blocking §7):** store-listing screenshots for
  both Apple and Google go on a public listing page anyone can view. Taking
  them from Richard's real household would put his family's actual names,
  schedule, and (for the People page) custody/childcare details in front of
  the public. Before generating screenshots, Richard should choose: (a) a
  dedicated demo household seeded with placeholder names/events for
  screenshot purposes, (b) using the real household but with Richard
  reviewing/approving each screenshot first, or (c) taking the screenshots
  himself. Not decided unilaterally here.
