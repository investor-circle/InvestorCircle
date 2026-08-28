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
profile (`developmentClient: true`, needs `expo-dev-client` — now
installed) is meant for connecting to a locally running Metro bundler for
live JS reloading during development. Without a computer running that
server, installing a `development`-profile build does **not** show this
app's actual screens — it opens Expo's own dev-launcher UI asking you to
connect to a server. It's not a substitute for the `preview` profile
you've actually been testing with. Its only relevance to phone-only
debugging: it's a debug-variant native build, so if it *also* crashed
before reaching even that launcher screen, that would point to something
below the JS layer entirely — Sentry (above) should make that
distinction moot in practice, since its native crash handler initializes
independently of whether the JS layer ever runs.

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
- Feed tab: real data from `GET /api/data?resource=recommendations&scope=received`,
  loading/empty/error-safe states, pull-to-refresh
- Discover/Track/Profile tabs: navigable placeholders (Profile has working
  sign-out); their API calls (`getPublicFeed`, `getNetworkEngagementFeed`,
  `getMyMadeRecos`) are already wired in `src/services/api/recommendationsApi.js`,
  UI not yet built
- `metro.config.js` disables Metro's package-exports resolution
  (`unstable_enablePackageExports = false`) — without it, `firebase/auth`'s
  React Native persistence build never gets picked up (see the comment in
  that file), and login sessions would silently fail to survive closing the
  app. This is a real bug fix, not a preference — verify item 9 in the
  physical-device test checklist against a build made *after* this change.
- **Crash reporting (Sentry)**: `index.js` (package.json's `"main"`, not
  `expo-router/entry` directly) calls `Sentry.init()` as the very first
  thing in the JS bundle, before any other import — see the comment there
  for why. Needs `EXPO_PUBLIC_SENTRY_DSN` at runtime (public, same
  embed-in-the-bundle caveat as the Firebase keys) and, for a build's
  crash reports to show real (not minified) stack traces,
  `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` at build time only
  (never in `.env`, never in the bundle) — see `.env.example`. Was added
  specifically because guessing at launch-crash root causes from build
  logs alone stopped being good enough; going forward, an actual device
  crash produces a real report at sentry.io instead of another guess.
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

## Deliberately not yet built

- Google sign-in (needs `expo-auth-session` + a native OAuth client ID —
  scoped out of this pass rather than half-wired)
- Ideas/recommendation detail screen, Connections, Circles, Discover feed UI,
  Notifications, Portfolio/Track UI, public profile deep-link screen
- Push notifications (native token registration would replace the web
  Web Push flow — needs its own design pass, not a straight port)
- `expo-updates` / OTA wiring, EAS project registration
