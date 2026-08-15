# CLAUDE_HANDOVER.md
> Handover document for new Claude sessions on the myInvestorCircle web app.
> Created from repository snapshot. Do not invent information not in the code.
>
> **Phase 5 note:** this doc predates the Phase 5 refactor, which split
> `App.jsx` (previously ~12,800 lines) into `src/features/**`,
> `src/components/common.jsx`, `src/constants/**`, `src/utils/**`, and
> `src/services/api/**`, and added `react-router-dom` (`HashRouter`) for
> section URLs. Any line-number references to `App.jsx` below are stale —
> see `CLAUDE.md`'s "Phase 5 architecture" section for the current layout,
> and locate code by feature/component name (e.g. `grep -rn` under
> `src/features/`) rather than by the line numbers cited here.

---

## 1. PROJECT OVERVIEW

**myInvestorCircle (MIC)** is a private, invite-only social investing platform where users share high-conviction investment recommendations within a trusted network of connections.

**Primary purpose:** Allow investors to post stock/asset recommendations to their personal "circle" (connections and groups), track each other's track records, and build credibility through a scored history of calls.

**Primary users:** Retail investors (Indian market focus — NSE/BSE stocks prominent). One admin user (`ankur.citm@gmail.com`) manages the platform.

**Verified major user journeys:**
- Sign up / sign in / forgot password (email + Firebase Auth)
- Send/accept/reject connection requests; manage groups
- Post a recommendation (Buy/Sell, public or circle-only) with price, thesis, conviction, target
- Receive recommendations in a scored feed; mark as invested; track performance
- View any user's public Track Record page (`/#/investor/{username}`)
- Exit a recommendation (triggers notifications to all recipients)
- Admin: create users, seed recommendations, manage creators/instruments/config

---

## 2. TECHNOLOGY STACK

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5, single-page app, hash routing |
| Database | Neon (PostgreSQL), queried directly from frontend via `@neondatabase/serverless` |
| Auth | Firebase Authentication (email/password), v11 |
| Analytics | Firebase Analytics (`getAnalytics`/`logEvent`), opt-in via `VITE_FIREBASE_MEASUREMENT_ID` |
| Hosting (frontend) | GitHub Pages, custom domain `myinvestorcircle.com` via `public/CNAME` |
| CI/CD | GitHub Actions (`deploy.yml`) → Vite build → `peaceiris/actions-gh-pages` |
| Backend API | Vercel serverless functions (`api/`) — Python 3.9 and Node.js |
| Email | Resend (`resend>=2.0.0`) via `api/email.py` |
| Push notifications | Web Push / VAPID via `api/push.js`; service worker at `public/sw.js` |
| Password reset | Firebase Admin SDK (`firebase-admin>=6.0.0`) via `api/reset.py` |
| Price data | Finnhub API via `api/price.js`; NSE/BSE instruments loaded from Neon |
| CAS import | `api/cas.py` (Python, parses CAS PDFs via `casparser`) |
| UI icons | `lucide-react` 0.383.0 |
| Export | `jspdf`, `jspdf-autotable`, `xlsx` |
| PDF parsing | `pdfjs-dist` |

**Key env vars (see `.env.example` for full list):**
- `VITE_DATABASE_URL` — Neon non-pooled connection string (baked into frontend bundle)
- `VITE_FIREBASE_*` — Firebase web app config (6 vars)
- `VITE_FIREBASE_MEASUREMENT_ID` — Firebase Analytics measurement ID (`G-...`)
- `VITE_CAS_API_URL` / `VITE_PRICE_API_URL` — Vercel project URL (both point to same project)
- `VITE_VAPID_PUBLIC_KEY` — VAPID public key (baked into bundle at build time)
- Vercel-only (not `VITE_`): `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `DATABASE_URL` (pooled), `RESEND_API_KEY`, `FROM_EMAIL`, `FIREBASE_SERVICE_ACCOUNT_JSON`

---

## 3. PROJECT STRUCTURE

```
InvestorCircle-main/
├── src/
│   ├── App.jsx              # ~13,400 lines — entire frontend (see Section 7)
│   ├── AuthContext.jsx      # Firebase auth state, profile sync, admin detection
│   ├── LoginPage.jsx        # Login / sign-up / forgot-password UI
│   ├── firebase.js          # Firebase init (auth × 2, analytics, track() helper)
│   ├── supabaseClient.js    # Neon `sql` tagged-template export (named supabase for legacy)
│   ├── db.js                # All DB helper functions (connections, recos, groups, ICI)
│   ├── exporters.js         # PDF/Excel export logic
│   ├── importers.js         # CAS/PAN import parsing helpers
│   ├── index.css            # Minimal global resets (most CSS is inline/STYLES constant)
│   ├── main.jsx             # React entry point
│   └── services/
│       ├── cas.js           # CAS PDF API client
│       ├── marketData.js    # Instrument/sector data loader (Neon `instruments` table)
│       ├── pan.js           # PAN-based portfolio import
│       └── priceService.js  # Finnhub price fetching with local cache
├── api/                     # Vercel serverless functions
│   ├── push.js              # Web Push sender (Node) — reads push_subscriptions from Neon
│   ├── email.py             # Resend email sender (Python) — 12 templates
│   ├── reset.py             # Firebase Admin password reset link generator + email send
│   ├── cas.py               # CAS PDF parser (Python, casparser library)
│   └── price.js             # Finnhub price proxy
├── public/
│   ├── sw.js                # Service worker — push events, notification click deep-link
│   ├── CNAME                # myinvestorcircle.com — must not be deleted (GitHub Pages)
│   └── mic-logo.png
├── supabase/
│   ├── schema.sql           # Original prototype schema (reference only — not the live schema)
│   ├── migration_auth.sql   # Adds user_profiles, user_data tables
│   └── migration_v2.sql     # Live schema: connections, ic_groups, ic_recommendations,
│                            #   recommendation_deliveries, notifications, sharing_preferences
├── scripts/
│   ├── stamp-prices.js      # Batch price stamper (run manually or via cron)
│   └── fetch_nse_sectors.py # NSE/BSE instrument data loader into Neon
├── .github/workflows/deploy.yml  # GitHub Actions CI/CD
├── .env.example             # All required env vars documented
├── vercel.json              # CORS headers for /api/* routes
├── package.json             # Node dependencies
└── requirements.txt         # Python dependencies (casparser, resend, firebase-admin)
```

---

## 4. MAJOR FEATURES

**Feature:** Authentication + profile  
**Purpose:** Email/password login via Firebase; profile stored in `user_profiles` Neon table; admin role determined by email hardcoded in `AuthContext.jsx`  
**Location:** `AuthContext.jsx`, `LoginPage.jsx`, `src/firebase.js`  
**Dependencies:** Firebase Auth, Neon `user_profiles` table

---

**Feature:** Password reset  
**Purpose:** Custom branded reset email flow — frontend calls `api/reset.py` which uses Firebase Admin SDK to generate an oobCode and sends a Resend email with a custom URL  
**Location:** `LoginPage.jsx` (forgot tab), `api/reset.py`, `App.jsx` (`ResetPasswordPage` component at bottom of file)  
**Dependencies:** `FIREBASE_SERVICE_ACCOUNT_JSON`, `RESEND_API_KEY` in Vercel; `confirmPasswordReset` from Firebase client SDK

---

**Feature:** Connections + groups  
**Purpose:** Users connect 1:1 (pending → accepted); groups allow broadcasting recommendations to multiple people at once  
**Location:** `src/db.js` (all DB logic), `App.jsx` `Network` component (~line 2306), `App.jsx` `GroupsSection` (~line 2605)  
**Dependencies:** Neon tables `connections`, `ic_groups`, `group_members`

---

**Feature:** Recommendations  
**Purpose:** Create Buy/Sell recommendations; deliver to specific users/groups; recipients can mark invested, track, react; sender can exit; public recos appear on Track Record  
**Location:** `src/db.js` (`createRecommendation`, `getMyReceivedRecos`, `getMyMadeRecos`, `setExitSignal`), `App.jsx` `MakeRecoModal` (~line 4525), `ReceivedSection` (~line 3334), `MadeSection` (~line 3955)  
**Dependencies:** Neon tables `ic_recommendations`, `recommendation_deliveries`, `recommendation_reactions`, `recommendation_tracking`

---

**Feature:** Public Track Record + ICI Score  
**Purpose:** Every user with a username gets a public profile at `/#/investor/{username}` showing their full recommendation history, scorecard, and computed ICI credibility score  
**Location:** `src/db.js` (`getPublicProfile`, `computeIci`), `App.jsx` `PublicProfilePage` (~line 5645), `App.jsx` `RecoPostPage` (~line 5241)  
**Dependencies:** `ic_recommendations` (is_public=true rows only); ICI is pure JS calculation — no separate DB table

---

**Feature:** Feed (HomeFeed)  
**Purpose:** Scored, filterable feed of received recommendations; sources: direct, group, network engagement (liked/commented by circle), public  
**Location:** `App.jsx` `HomeFeed` (~line 7829), `scoreFeedRec` function (~line 7603)  
**Dependencies:** `recsReceived` state, `networkEngagementRecos` (separate DB query), `publicFeedRecos`

---

**Feature:** Push notifications  
**Purpose:** Web Push to subscribed devices when: new reco, connection request/accepted, comment, like  
**Location:** `api/push.js` (sender), `public/sw.js` (service worker), `App.jsx` (`subscribePush`, `requestPushPermission`, proactive opt-in toast, all `sendPush()` call sites)  
**Dependencies:** `push_subscriptions` Neon table (run `migration_push.sql` — not in repo), VAPID keys

---

**Feature:** In-app notifications (bell icon)  
**Purpose:** LinkedIn-style notification panel with consolidated notifications; bell badge count  
**Location:** `App.jsx` `NotificationPanel` component (~line 2103), `src/db.js` (`getMyNotifications`, `markNotifRead`)  
**Dependencies:** Neon `notifications` table

---

**Feature:** Transactional email  
**Purpose:** 12 email templates (welcome, invite, connection, reco, claim flow, password reset)  
**Location:** `api/email.py`  
**Dependencies:** `RESEND_API_KEY`, `FROM_EMAIL` Vercel env vars; domain verified in Resend

---

**Feature:** Portfolio + CAS import  
**Purpose:** Users track personal holdings; can import from CAS PDF or PAN lookup  
**Location:** `App.jsx` `Portfolio` component (~line 2807), `src/services/cas.js`, `src/services/pan.js`, `api/cas.py`  
**Dependencies:** `api/cas.py` on Vercel, Neon holdings tables

---

**Feature:** Creator/Track Record claim flow  
**Purpose:** Admin can create "unclaimed" creator profiles from historical data; real investors can claim their profile  
**Location:** `App.jsx` `ClaimProfilePage` (~line 11440), `AdminCreators` (~line 11210), `App.jsx` admin claim handling  
**Dependencies:** `user_profiles.claim_status`, `user_profiles.is_unclaimed`, Neon

---

**Feature:** Market + Security Intelligence  
**Purpose:** Aggregate view of what the circle is recommending for a given ticker; consensus bar  
**Location:** `App.jsx` `MarketIntelligencePage` (~line 12320), `SecurityIntelligencePage` (~line 12593), `SecurityQuickPanel` (~line 11542)

---

**Feature:** Firebase Analytics  
**Purpose:** Tracks: login, sign_up, page_view, reco_created, reco_liked, connection_sent, connection_accepted, push_enabled, password_reset_requested/completed  
**Location:** `src/firebase.js` (`track()` helper), `App.jsx`, `LoginPage.jsx`  
**Dependencies:** `VITE_FIREBASE_MEASUREMENT_ID` GitHub secret + Vercel env var

---

## 5. IMPORTANT BUSINESS LOGIC

### 5a. Return / PnL Calculation
**What:** Percentage return = `(current_price - reco_price) / reco_price * 100`. For Sell recommendations the direction is inverted: profit when price falls. Exit price (`exit_price`) is used for closed positions when available; falls back to `current_price`.  
**Where:** `src/db.js` `getPublicProfile` SQL (inline CASE expressions), `App.jsx` line ~2918 `const ret = (r) => ...`, `App.jsx` `TrackedSection` (~line 3106)  
**⚠ Do not change:** direction inversion for Sell type; fallback chain `exit_price → current_price → reco_price`

### 5b. Recommendation Status Rules
**What:** Active = `NOT exit_signal AND (target_date IS NULL OR target_date >= today)`. Closed = `exit_signal = true`. Expired = `NOT exit_signal AND target_date < today`.  
**Where:** `src/db.js` `getPublicProfile` SQL comments and CASE expressions; `App.jsx` `StatusBadge2` (~line 5095)  
**⚠ Do not change:** these three states are mutually exclusive and the SQL depends on the exact logic

### 5c. ICI Score Calculation
**What:** 7-component credibility score (0–100), computed in JS from summary statistics. Components and weights:

| Component | Max pts | Threshold for full marks |
|---|---|---|
| Track record length | 15 | 3 years |
| Recommendation volume | 15 | 20 recommendations |
| Hit rate | 20 | 100% (linear) |
| Median return | 15 | 15% median |
| Risk-adjusted return | 15 | Sharpe ratio 2.0 |
| Transparency | 10 | 0 deletions |
| Profile verification | 10 | Always 10 (placeholder) |

Band: Strong ≥75, Good ≥55, Building ≥35, Early <35  
**Where:** `src/db.js` `computeIci()` function  
**⚠ Do not change:** weights, thresholds, or band definitions without explicit product approval

### 5d. Feed Scoring Algorithm
**What:** `scoreFeedRec()` scores each feed card. Base 5–10 by source type, +15 for circle connection, up to +100 for recency (decays 3.5 pts/day over ~29 days), +8/like +5/comment for engagement, up to +40 for price movement >5%, −20 if already tracked/invested.  
**Where:** `App.jsx` `scoreFeedRec` function (~line 7603)  
**⚠ Do not change:** recency decay rate or engagement multipliers without considering feed experience

### 5e. Recommendation Delivery Deduplication
**What:** `createRecommendation` in `db.js` uses a `Set` to prevent duplicate delivery rows when a user is in multiple target groups. `ON CONFLICT DO NOTHING` on the DB side as second guard.  
**Where:** `src/db.js` `createRecommendation`  
**⚠ Do not change:** the delivered Set logic or the unique constraint on `recommendation_deliveries`

### 5f. Reaction / Like Dual Write
**What:** When a user reacts via `updateDelivery`, the reaction is mirrored to `recommendation_reactions` table (used for public like counts on Track Record). The delivery-level reaction is personal; the reactions table is the single source of truth for public counts.  
**Where:** `src/db.js` `updateDelivery` (mirror logic), `App.jsx` `handleLike` in `RecoPostPage`  
**⚠ Do not change:** both writes must stay in sync

### 5g. Admin Role Detection
**What:** Admin status is determined by email address hardcoded in `AuthContext.jsx` (`ADMIN_EMAILS = ["ankur.citm@gmail.com"]`) OR by `is_admin = true` in `user_profiles`. Admin users see a toggle to switch between investor view and admin panel.  
**Where:** `src/AuthContext.jsx`, `App.jsx` `userIsAdmin` and `viewAsAdmin` state  
**⚠ Do not change:** the dual-check logic (email OR DB flag); breaking this locks out the admin

### 5h. Blacklisted / Deleted Users
**What:** On every auth state change, `AuthContext.jsx` checks `deleted_users` table. If found, the user is immediately signed out.  
**Where:** `src/AuthContext.jsx` `onAuthStateChanged` handler  
**⚠ Do not change:** this is a security control; the check must happen before `setUser`

### 5i. Connection Request One-Row Rule
**What:** Only one row per pair (A→B and B→A share the same row). `sendConnectionRequest` checks both directions before inserting.  
**Where:** `src/db.js` `sendConnectionRequest`  
**⚠ Do not change:** uniqueness check must remain bidirectional

### 5j. Public Profile — Visibility Filter
**What:** All stats on public Track Record pages filter to `is_public = true` only. Private (circle-only) recommendations never appear publicly.  
**Where:** `src/db.js` `getPublicProfile` (every SQL query has `AND is_public = true`)  
**⚠ Do not change:** removing this filter would leak private recommendations

---

## 6. CURRENT ARCHITECTURE

```
Browser (GitHub Pages)
  └─ React SPA (App.jsx + supporting src/ files)
       ├─ Reads/writes Neon directly via @neondatabase/serverless (VITE_DATABASE_URL)
       │    └─ All DB helpers centralised in src/db.js
       ├─ Firebase Auth (client SDK) for session management
       ├─ Firebase Analytics (client SDK) for event tracking
       └─ Calls Vercel API for server-side operations:
            ├─ /api/push    (send push notifications — needs VAPID private key)
            ├─ /api/email   (send transactional emails — needs RESEND_API_KEY)
            ├─ /api/reset   (generate password reset link — needs Firebase Admin SA)
            ├─ /api/cas     (parse CAS PDF — compute-heavy Python)
            └─ /api/price   (proxy Finnhub — needs FINNHUB_KEY)
```

**Where business logic lives:**
- DB queries and data-shaping: `src/db.js` (well-modularised)
- ICI score calculation: `src/db.js` `computeIci()` (pure JS, no DB)
- Feed scoring: `App.jsx` `scoreFeedRec()` (inline, not yet extracted)
- Return/PnL calculations: split between `src/db.js` SQL and `App.jsx` inline
- All UI state, page routing, component rendering: `App.jsx`

**Already modularised:**
- `src/db.js` — all Neon DB operations
- `src/AuthContext.jsx` — auth state
- `src/services/` — market data, CAS, PAN, price services
- `src/exporters.js`, `src/importers.js` — data I/O
- `api/` — all server-side operations fully separated

---

## 7. APP.JSX MAP

`App.jsx` (~13,400 lines) is a monolith. Do not refactor without understanding all dependencies.

| Lines (approx) | Responsibility |
|---|---|
| 1–58 | Imports, constants (API URLs, VAPID key, `sendEmail`, `sendPush`, `track`) |
| 59–583 | CSS (`STYLES` constant — all component styles as a tagged template string) |
| 584–1960 | **Main `App()` component**: auth state, routing, all shared state (recos, connections, notifications, groups, holdings, push, feed config), all `useEffect` hooks, proactive push toast, main shell render |
| 2076–2105 | `SortTh`, `RecoBreakdown` — small shared UI components |
| 2103–2305 | `NotificationPanel` — bell icon panel with notification list |
| 2306–2533 | `Network` + `ContactsSection` + `AddConnectionModal` — connections page |
| 2534–2778 | `PortfolioModal`, `GroupsSection`, `MemberPanel`, `GroupModal` |
| 2779–2933 | Portfolio hooks (`useDerivedHoldings`, `Sparkline`, `Ring`, `Portfolio`) |
| 2934–4192 | `Recommendations`, `TrackedSection`, `ReceivedSection` — recs received page |
| 4193–4524 | `AddReceivedModal`, thesis helpers, `ThesisEditor`, `ThesisRenderer` |
| 4525–4822 | `MakeRecoModal` — new recommendation creation form |
| 4823–4975 | `Sharing` — sharing preferences UI |
| 4976–5239 | Public profile UI helpers (ICI donut, score boxes, badges, popovers) |
| 5241–5644 | `RecoPostPage` — standalone public reco page (`/#/investor/u/reco/id`) |
| 5645–6953 | `PublicProfilePage` — full public track record page |
| 6954–7163 | `ProfileEditModal`, `ProfileModal` |
| 7164–7277 | `InvestedToggle`, `RecoComments` |
| 7278–7828 | `FeedCard`, feed scoring, `RecoCardModal`, widget components |
| 7829–8130 | `HomeFeed` — main feed page |
| 8131–8242 | Instrument search (NSE/BSE lookup) |
| 8243–9189 | Admin seed data, feed config, instruments, SEBI registered advisors panels |
| 9189–9537 | Admin users, groups, configs management |
| 9538–9827 | `RichTextEditor`, `AboutPage`, `AdminAboutEditor` |
| 9828–10199 | `ContactPage`, `PrivacyPolicyPage`, `SiteFooter` |
| 10200–10611 | Consensus bar, strength dot, `PeopleSearch` |
| 10612–11209 | `InviteModal`, `CreateCreatorModal`, `AdminRecoSeedModal` |
| 11210–11513 | `AdminCreators` |
| 11514–12096 | `ClaimProfilePage`, spark line, `SecurityQuickPanel` |
| 11706–12319 | `PortfolioIntelligencePage` |
| 12320–13194 | `MarketIntelligencePage`, `SecurityIntelligencePage` |
| 13195–end | `ResetPasswordPage` |

**Uses separate services/components:**
- All DB: `src/db.js`
- Auth: `src/AuthContext.jsx`
- Prices: `src/services/priceService.js`
- Market data (instruments): `src/services/marketData.js`
- CAS/PAN: `src/services/cas.js`, `src/services/pan.js`
- Exports: `src/exporters.js`

---

## 8. CRITICAL "DO NOT BREAK" ITEMS

1. **ICI score formula** (`src/db.js` `computeIci`) — weights and thresholds are product-defined
2. **Return direction for Sell recos** — everywhere returns are calculated, Sell must invert sign
3. **`is_public` filter on all public profile queries** — private recos must never leak publicly
4. **`recommendation_reactions` dual-write** — delivery reaction + reactions table must stay in sync
5. **Admin email list** in `AuthContext.jsx` — only way to access admin panel
6. **Blacklist check before `setUser`** in `AuthContext.jsx` — security control
7. **`public/CNAME` file** — must never be deleted; GitHub Pages overwrites the domain on every deploy without it
8. **`push_subscriptions` table** — must exist in Neon before push notifications work (not in the committed migrations; run `migration_push.sql` separately)
9. **Vercel env vars** — `VAPID_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `RESEND_API_KEY`, `DATABASE_URL` (pooled); if any are missing, the corresponding API silently fails
10. **`VITE_DATABASE_URL`** vs **`DATABASE_URL`** — frontend uses the non-pooled URL baked into the bundle; Vercel functions use the pooled URL as `DATABASE_URL`
11. **Hash routing** (`window.location.hash`) — all internal navigation uses hash; push notification deep links depend on `#/investor/{username}/reco/{id}` format
12. **Connection uniqueness** — bidirectional check in `sendConnectionRequest`; one row per pair
13. **`recommendation_deliveries` unique constraint** — prevents duplicate deliveries when user is in multiple groups

---

## 9. CURRENT STATE / KNOWN LIMITATIONS

- **`App.jsx` is a monolith** (~13,400 lines). All UI components and most business logic live here. This is intentional for the current stage; do not refactor without careful dependency analysis.
- **`schema.sql` is reference-only** — the live Neon DB uses `migration_auth.sql` + `migration_v2.sql` + `migration_push.sql` (push_subscriptions, not committed to repo). The original `schema.sql` tables (`profiles`, `recommendations`, etc.) are prototype scaffolding and do not match the live schema.
- **`supabaseClient.js` naming** — named "supabase" for historical reasons; the app uses Neon, not Supabase.
- **`VITE_DATABASE_URL` security** — the Neon connection string is baked into the browser bundle. Acceptable for a personal/invite-only app but not suitable for a public production app at scale.
- **Settings page not built** — push notification management is only accessible via the bell icon panel. A Settings page is planned but not implemented.
- **Price stamping** — `scripts/stamp-prices.js` must be run manually or via external cron to update `current_price` on recommendations. No automated scheduling in the repo.

---

## 10. MOBILE CONTEXT

Mobile application is maintained separately and is not part of this web repository snapshot.

---

## 10a. PHASE 5.5 KNOWN ISSUES / TECH DEBT (flagged 2026-08-15, not yet fixed)

Phase 5.5 (Google Sign-In, mandatory username+consent, one-time Discover
modal, PR #8) shipped clean on its own release-gate review, but surfaced a
few pre-existing or scope-adjacent items worth cleaning up later. None of
these block current functionality — flagging so they aren't lost:

- **Login error hint is unreliable due to Firebase Email Enumeration
  Protection.** `LoginPage.jsx`'s `handleLogin` tries `fetchSignInMethodsForEmail`
  to give a targeted "this account uses Google — click Continue with Google"
  hint on login failure. This project has Email Enumeration Protection
  enabled in Firebase, which makes that API return empty/unreliable data —
  the hint silently never fires and users just see the generic "Incorrect
  email or password" message. Not broken (fails safe to the generic
  message), just never actually helpful. A provider-agnostic fix was
  discussed and scoped but not built — pending a product decision on the
  copy. Do NOT try to "fix" this by working around enumeration protection
  client-side (that would recreate the enumeration oracle the setting
  exists to prevent) — keep the protection, adjust the wording instead.
- **The mandatory username+consent gate (`OnboardingGate` /
  `MandatorySetupGate`) is UI-only, not enforced server-side on other
  endpoints.** A caller with a valid Firebase ID token could call other
  authenticated API actions (e.g. `portfolio-add`, `avatar-upload`) directly
  without ever completing the consent/username gate — nothing in
  `api/_lib/handlers/*.js` currently checks `consent_terms_accepted` /
  `consent_data_accepted` / `username IS NOT NULL` before allowing other
  writes. This matches the app's existing architecture (no other feature
  enforces "onboarding complete" server-side either), so it wasn't added
  as part of Phase 5.5, but is worth a deliberate decision later if
  consent enforcement needs to be airtight rather than just UI-gated.
- **Redundant legacy consent columns on `user_profiles`**: `Platform_consent`,
  `privacy_consent`, `marketing_consent`, `consent_version`, `consent_at`
  pre-date Phase 5.5 and are blank/unused for most rows — they were never
  reliably populated by any code path found in this repo. Phase 5.5 added
  its own `consent_terms_accepted` / `consent_data_accepted` /
  `consent_accepted_at` columns instead of reusing them (see
  `supabase/phase_5_5_consent.sql` for the reasoning). Whether to
  backfill/consolidate onto the old columns, migrate away from them, or
  drop them entirely is an explicitly deferred decision — do not touch
  them without discussing scope/legal implications first.
- **Creator-claim flow's consent checkboxes don't persist anywhere.**
  `Profile.jsx` (`ProfileEditModal`, `claimMode`) shows the same two
  consent checkboxes as signup, but `api/_lib/handlers/claim-profile.js`'s
  `submit-claim` action has never accepted or stored consent fields —
  confirmed by reading that handler. Pre-existing gap, unrelated to Phase
  5.5's scope, not fixed by it.

---

## 11. INSTRUCTIONS FOR FUTURE CLAUDE SESSIONS

1. **Read `src/db.js` before writing any DB-touching code.** All table names, column names, and relationships are verified there. Do not assume schema from variable names in App.jsx.
2. **Inspect existing functionality before adding new functionality.** App.jsx is large; the feature you're about to build may already exist.
3. **Treat business calculations as sensitive.** ICI score, return calculations, and recommendation status rules must not be changed without explicit instruction.
4. **Preserve existing behaviour unless explicitly asked to change it.** Especially: feed scoring, notification types, email template names.
5. **Reuse `sendEmail`, `sendPush`, and `track` helpers** already defined at the top of App.jsx. Do not create new fetch calls for these.
6. **Do not duplicate business logic** between App.jsx and db.js. DB logic belongs in db.js; pure UI logic belongs in App.jsx.
7. **Prefer targeted, surgical `str_replace` edits** over broad rewrites. Verify the exact string before replacing.
8. **Do not make architectural changes for cleanliness** — no refactoring App.jsx into separate files unless explicitly requested.
9. **Always verify the build compiles** after changes to App.jsx or LoginPage.jsx using `npx vite build`.
10. **Do not modify `public/CNAME`.** It is required for the custom domain to survive GitHub Pages redeployments.
11. **The `push_subscriptions` table is not in the committed migrations.** If working on push notifications on a fresh DB, run the separate `migration_push.sql` first.
12. **New Claude sessions should start by uploading the latest `App.jsx` as a project file** rather than relying on conversation history, due to its size.
