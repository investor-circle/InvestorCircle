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

Once a build is possible:

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

## Deliberately not yet built

- Google sign-in (needs `expo-auth-session` + a native OAuth client ID —
  scoped out of this pass rather than half-wired)
- Ideas/recommendation detail screen, Connections, Circles, Discover feed UI,
  Notifications, Portfolio/Track UI, public profile deep-link screen
- Push notifications (native token registration would replace the web
  Web Push flow — needs its own design pass, not a straight port)
- `expo-updates` / OTA wiring, EAS project registration
