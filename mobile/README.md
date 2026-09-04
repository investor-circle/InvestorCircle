# myInvestorCircle — Mobile (Expo / React Native)

Native mobile client for myInvestorCircle, built with Expo SDK 57 and
Expo Router (file-based navigation). It talks to the **same** Firebase
project and the **same** Vercel-hosted `api/` backend as the web app in the
repo root — there is no separate mobile backend, no direct database access,
and no duplicated business logic. See the repo root `CLAUDE.md` for the
full architecture; this file only covers what's specific to the mobile app.

## Structure

```
mobile/
  app/                    # Expo Router routes (file-based navigation)
    _layout.js            # Root layout — auth gate (redirects to (auth) or (tabs))
    (auth)/login.js        # Email/password sign-in
    (tabs)/                 # Bottom tab navigator
      _layout.js
      index.js             # Feed (wired to real API data)
      discover.js          # Placeholder — Pulse/Discover
      track.js             # Placeholder — Track/Tracking
      profile.js           # Profile + sign out
  src/
    config/firebase.js     # Firebase init, RN persistence via AsyncStorage
    context/AuthContext.js # Mirrors src/AuthContext.jsx (web) — same endpoints
    services/api.js        # callApi() — mirrors src/db.js's callApi()
    services/api/*.js      # Feature-scoped API modules (same shape as
                            # src/services/api/*.js on web)
    components/            # Shared presentational components
    theme/colors.js         # Shared color tokens
    utils/format.js         # Display-formatting helpers (duplicated from
                            # web's src/utils/format.js — see note in file)
```

## Why these choices

- **Expo + Expo Router**: current standard for new Expo apps — file-based
  routing gives deep linking and universal links close to free, which the
  product needs for `myinvestorcircle.com/#/investor/{username}`-style
  shareable links.
- **Firebase JS SDK (not `@react-native-firebase`)**: the web app already
  uses the Firebase JS SDK; reusing it here means one Firebase project,
  one auth flow to reason about, and no native Firebase config
  (`google-services.json`/`GoogleService-Info.plist`) to maintain — at the
  cost of losing a few native-only Firebase features we aren't using
  (native push via FCM directly, etc.). `getReactNativePersistence` +
  AsyncStorage stands in for the browser's localStorage-based persistence.
- **All data access goes through `api/data.js`** (the same endpoint the web
  app calls), authenticated with a Firebase ID token — never a
  client-supplied uid, never direct Neon access from the client. This is
  the same rule as `CLAUDE.md`'s "Prohibition on browser-side Neon access",
  applied to the mobile client too.
- **JavaScript, not TypeScript**: matches the web app's stated convention
  (`CLAUDE.md`: "This is a JavaScript (JSX) codebase — no TypeScript").

## Environment

Copy `.env.example` to `.env.local` and fill in the same Firebase web app
config values used in the repo root `.env.example` (same Firebase project),
plus the API origin:

```
cp .env.example .env.local
```

`EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time — same
public-by-definition caveat as `VITE_*` vars on web. Never put a secret in
one.

## Running

```
npm install
npm run android   # or: npm run ios / npm start
```

Needs `EXPO_PUBLIC_FIREBASE_*` + `EXPO_PUBLIC_API_ORIGIN` set (see above) to
actually authenticate and load data — without them the app renders but
sign-in will fail.

## Validating without a device/emulator

`npx expo export --platform android` (or `--platform ios`) runs a full
Metro bundle and catches import/resolution/syntax errors without needing a
simulator — useful in CI or a sandboxed dev environment.

## Deployment (EAS)

`eas.json` has `development` / `preview` / `production` build profiles.

**Important limitation of this sandboxed session**: the coding environment
this app was built in has outbound network access to `expo.dev` /
`api.expo.dev` (and `ngrok.com`, used for Expo Go's tunnel mode) blocked by
its organization's egress policy — confirmed via explicit 403 responses,
not a timeout or misconfiguration. That means **no build produced from
inside this session** — not an EAS cloud build, not a local `expo start`
dev-server your phone could connect to — is possible here. There is also
no Android SDK installed in this sandbox for a local Gradle build. The
build has to be triggered from a machine that can actually reach Expo's
servers — realistically, your own computer (or another Claude Code
environment without that restriction). See the root-level runbook this
repo's mobile README links to for exact commands.

**Phone-only path**: `.github/workflows/mobile-build-android.yml` runs the
build on GitHub's own servers instead — triggered with a button tap from
the GitHub Actions tab (works from the GitHub mobile app or a phone
browser, no terminal). It reuses the same `VITE_FIREBASE_*` secrets
`ci.yml` already has configured for the web app (same Firebase project),
so the only new secret needed is `EXPO_TOKEN`. See the repo root for setup
steps, or ask for the walkthrough again.

**About the `development` build profile**: `eas.json`'s `development`
profile (`developmentClient: true`, needs `expo-dev-client` installed) is
meant for connecting to a locally running Metro bundler for live JS
reloading during development. Without a computer running that
server, installing a `development`-profile build does **not** show this
app's actual screens — it opens Expo's own dev-launcher UI asking you to
connect to a server. It's not a substitute for the `preview` profile
you've actually been testing with. Its only relevance to phone-only
debugging: it's a debug-variant native build, so if it *also* crashed
before reaching even that launcher screen, that would point to something
below the JS layer entirely.

Once a build is possible (from a computer or via that workflow):

- **Android**: `eas build -p android --profile preview` → internal
  distribution for testing, then `--profile production` → Play Store via
  `eas submit`.
- **iOS**: `eas build -p ios --profile preview` → TestFlight, then
  `--profile production` → App Store via `eas submit`.
- **OTA updates**: `expo-updates` is not yet installed. Once added, JS-only
  changes (no new native modules) can ship via `eas update` without an app
  store review; anything touching native code (new native deps, permission
  changes) still needs a new store build. This is the mechanism to keep
  frequently-changing product behavior server/OTA-driven per the project's
  deployment guidance, rather than gating every change on a store release.

## What's implemented so far

- Navigation shell (Expo Router, auth-gated stack + bottom tabs)
- Firebase email/password auth, mirroring `src/AuthContext.jsx` (blacklist
  check before session commit, profile sync/create, same server endpoints)
- Feed tab: the **same three-source merge as the web Feed tab** — direct
  deliveries (`scope=received`) + network-engagement recos + public platform
  recos — deduped by id, filtered by the effective feed config, and ranked by
  the shared `scoreFeedRec`. Composition lives in `src/utils/feed.js` (mirrors
  `feedRecs` in `src/features/discovery/Discovery.jsx` plus the source mapping
  and effective-config resolution in `src/App.jsx`). Loading/empty/error
  states, pull-to-refresh. (Earlier this tab showed only direct deliveries — a
  strict subset — which was the "limited ideas" discrepancy.)
- Discover tab: public recommendations from across the platform (`getPublicFeed`,
  same source as the web Pulse "Trending on MIC"/public feed), newest-first.
- Track tab: segmented "Made by me" (`getMyMadeRecos`) / "Tracked"
  (`getMyTrackedRecos`) lists of the caller's own posted and tracked ideas.
- Profile tab: avatar/name/username/admin badge + working sign-out.
- Shared `RecoListScreen` (`src/components/RecoListScreen.js`) backs
  Discover and Track — one place for the list/loading/empty/error/refresh
  behaviour and FlatList perf props, so they stay consistent.
- **Design system matches the web app**: `src/theme/colors.js` carries the
  exact tokens from `src/styles/globalStyles.js` (light theme, `#6d5df5`
  purple accent, the 135° purple→magenta `GRADIENT`, gain/loss greens/reds);
  Plus Jakarta Sans is loaded via `@expo-google-fonts` in `app/_layout.js`
  with weight presets in `src/theme/type.js`. `GradientHero` reproduces the
  web `.hero-grad` header; `RecoCard` matches the web feed card (gradient
  avatar, Buy/Sell pill, price+return inset, reco-price/target/horizon/
  conviction grid, status/sector pills, invested state).
- **Feed loads progressively**: the user's direct deliveries (fast) paint
  first, then public + network-engagement fold in and re-rank — so the feed
  is usable immediately instead of blocking on all five endpoints.
- **Reco detail** (`app/reco/[id].js`): opens instantly from an in-memory
  hand-off (`src/utils/recoStore.js`, no refetch) and loads engagement
  (`getEngagement`) for like / track / mark-invested / comments, all through
  the existing `engagement` endpoints.
- **New idea** (`app/new.js`, gradient FAB in the tab bar): posts a public
  recommendation via `createRecommendation` (per-circle recipient selection
  is the next increment).
- Bottom nav relabelled to match the web (Home / Pulse / My Recs / Profile).
- **Auth**: sign in, create account (Firebase + `api/profile/signup`, same
  username/password rules the server enforces) and forgot-password
  (`api/reset`, which always returns 200 — the UI shows the same
  confirmation either way, so it never reveals whether an address exists).
- **Sharing an idea**: the new-idea form picks recipients — specific
  connections and/or Circles, and/or public. The server re-validates every
  recipient (`authorizedCircleRecipientIds`); the picker is convenience only.
- **Own ideas**: the detail screen shows exit-signal and delete controls to
  the recommender only (the server independently enforces ownership).
- **Settings** (`app/settings.js`): edit your name, and toggle feed sources.
  Options are rendered from the admin-defined `feed_config_options` rather
  than a hardcoded list; `always_on` / admin-disabled options render locked.
- **Diagnostics** (`app/debug.js`) + `src/utils/logger.js`: on-device log of
  console output, uncaught errors, unhandled rejections and every API
  failure, persisted so it survives a freeze and force-close, with
  copy-to-clipboard. This is how device-only problems get diagnosed without
  adb.

## Enabling device push

Push is implemented end to end, but Android delivery needs Firebase Cloud
Messaging configuration that only the repo owner can supply. Until it is
supplied the app builds and runs normally — token registration simply no-ops
and says why in Profile → Diagnostics.

Three steps, in this order:

1. **Run the migration.** `supabase/phase10_expo_push_tokens.sql` creates the
   `expo_push_tokens` table. It is additive and safe to re-run; it does not
   touch `push_subscriptions` or web push. `api/push.js` tolerates the table
   being absent, so the code can ship before this runs.
2. **Give Expo your FCM credentials.** In the Firebase console (same project
   as web auth) enable Cloud Messaging, create a service account key, and
   upload it to the Expo project under Credentials → Android → FCM V1.
3. **Add `google-services.json`.** Download it from the Firebase console for
   the Android app with package `com.myinvestorcircle.app`, and place it at
   `mobile/google-services.json`. It is gitignored by default because
   whether to commit it is your call — but note EAS uploads the project with
   `git archive`, so a gitignored file **does not reach the build**. To ship
   it, either commit it (it holds public identifiers, not secrets) or supply
   it through EAS. `app.config.js` wires it up only when present, so a build
   without it still succeeds.

No change is needed to the notification triggers: everything already calls
`/api/push`, which now fans out to browsers and devices alike.

## Tests

`npm test` (Jest with the `jest-expo` preset, `mobile/jest.config.js` —
scoped to `mobile/` so the web app's own root Vitest config is untouched).

This replaced an earlier Vitest setup that could only run pure logic.
`jest-expo` supplies the babel transform and RN module mocks needed to
actually render components, so both kinds of test live in one runner rather
than one runner per kind.

Two layers:

- **Pure logic** — where a regression is silent and expensive: feed
  composition/dedup/config gating, Pulse ranking against each endpoint's real
  row shape, the `portfolio-add` payload contract, CAS import de-duplication,
  instrument search matching, deep-link parsing, auth error/hint selection,
  notification wording, and the display/business formatters (including the
  Sell-return inversion and the two date shapes from the CLAUDE.md incident
  note).
- **Components** (`@testing-library/react-native`) — where the wiring between
  a form and its logic can break without any pure test noticing: Add Holding
  (validation blocks a save, typed values reach the payload in the server's
  shape, picking an instrument fills the dependent fields) and the Google
  account-link prompt (it appears only on a real conflict, a wrong password
  keeps the user in the prompt, the typed password does not survive the
  prompt closing).

New tests are expected to be non-vacuous: when adding one, verify it fails
against a deliberate mutation of the code it covers before trusting it.
- `metro.config.js` disables Metro's package-exports resolution
  (`unstable_enablePackageExports = false`) — without it, `firebase/auth`'s
  React Native persistence build never gets picked up (see the comment in
  that file), and login sessions would silently fail to survive closing the
  app. This is a real bug fix, not a preference — verify item 9 in the
  physical-device test checklist against a build made *after* this change.
- **Native dependency versions**: every native module (anything with
  platform-specific code, not pure JS) must match the exact version in
  `expo/bundledNativeModules.json` for the installed Expo SDK — not just
  satisfy a loose semver range. `npm install <pkg>` grabs latest by
  default and does *not* check this; `npx expo install <pkg>` does. Two
  packages drifted a full major version ahead this way
  (`@react-native-async-storage/async-storage`, `react-native-gesture-handler`)
  and caused the app to crash on launch on a physical device — instantly,
  with no error screen, because it's a native-code-level mismatch, not
  something a JS bundle export or `expo-doctor`'s peer-dependency check
  catches. When adding or upgrading any native package here, verify it
  against `require('expo/bundledNativeModules.json')` before assuming
  `npm install` picked something safe.
- **Crash logger** (`plugins/withCrashLogger.js`): an Expo config plugin
  that injects a `Thread.setDefaultUncaughtExceptionHandler` as the first
  statement of the generated `MainApplication.onCreate()` — before
  `super.onCreate()`, before React Native loads, before any Expo module
  initializes. On any uncaught exception it appends the stack trace to
  `crash-log.txt` in the app's external files dir (`getExternalFilesDir(null)`,
  i.e. `Android/data/com.myinvestorcircle.app/files/crash-log.txt` under
  internal storage) before chaining to the default handler, so Android's
  normal crash dialog still shows. That path needs no runtime permission
  and no adb/root to read — any file manager app can browse to it. Added
  specifically to diagnose the still-unresolved instant-launch crash on a
  physical device without needing a computer for `adb logcat`. Only
  catches crashes from the point `onCreate()` is reached onward — a crash
  during earlier class loading/static init would still be invisible here.

## Deliberately not yet built

- Google sign-in (needs `expo-auth-session` + a native OAuth client ID —
  scoped out of this pass rather than half-wired)
- Ideas/recommendation detail screen, Connections, Circles, Discover feed UI,
  Notifications, Portfolio/Track UI, public profile deep-link screen
- Push notifications (native token registration would replace the web
  Web Push flow — needs its own design pass, not a straight port)
- `expo-updates` / OTA wiring, EAS project registration
