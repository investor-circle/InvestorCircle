# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

## Project overview

myInvestorCircle is a private, invite-only social investing web app. Users share
investment recommendations within a trusted circle of connections and groups, and
track each other's performance via a computed credibility score (ICI).

For a detailed, feature-by-feature map of the codebase (including approximate
line numbers in `App.jsx`), see `docs/CLAUDE_HANDOVER.md`. That document is
updated per-session and may go stale faster than this file — treat this file as
the stable baseline and the handover doc as supplementary detail, to be
verified against the actual code rather than trusted blindly.

## Architecture

- **Frontend**: React 18 + Vite 5, single-page app. `src/App.jsx` is the
  application shell (providers, top-level nav/state orchestration, page
  composition) — feature UI and business logic live under `src/features/**`
  (see "Phase 5 architecture" below). `src/services/` holds client helpers
  (CAS import, market data, PAN import, price fetching, notify, and the
  `services/api/**` frontend service layer).
- **Routing**: `react-router-dom`'s `HashRouter` (see `src/main.jsx`). The app
  is a static SPA on GitHub Pages with no server-side rewrite/404 fallback, so
  only the hash portion of a URL survives a hard refresh or a directly-opened
  link — path-based (`BrowserRouter`) routing would 404 on refresh. Major
  sections have real, shareable, refreshable URLs (`#/connections`,
  `#/recommendations`, `#/portfolio`, `#/sharing`, `#/admin/users`, etc. — see
  `INVESTOR_PATH_TO_PAGE` / `ADMIN_PATH_TO_PAGE` in `App.jsx`), alongside the
  pre-existing `#/investor/:username` and `#/investor/:username/reco/:id`
  public profile/recommendation deep links.
- **Backend**: Vercel serverless functions in `api/`, mixed Node.js and Python
  3.9. Used for email (Resend), push notifications, price proxying, CAS PDF
  parsing, and Firebase-Admin-based password reset.
- **Database**: Postgres via Neon. The browser never connects to Neon
  directly — all application data access goes through authenticated server
  APIs (`api/data.js` + `api/_lib/handlers/*.js`), called from the frontend
  via `src/db.js` (`callApi()`) and the feature-scoped barrels in
  `src/services/api/*.js`. See "Prohibition on browser-side Neon access"
  below.
- **Auth**: Firebase Authentication (email/password). Auth state and profile
  sync live in `src/AuthContext.jsx`; login/signup/reset UI in `src/LoginPage.jsx`.
  Password reset is server-mediated via `api/reset.py` using the Firebase Admin
  SDK.
- **Deployment**: Frontend deploys to GitHub Pages via
  `.github/workflows/deploy.yml` on push to `main`; backend functions deploy to
  Vercel. `public/CNAME` pins the custom domain — do not remove it.

## Phase 5 architecture (feature-oriented frontend)

Phase 5 (2026) broke the ~12,800-line `App.jsx` monolith into feature
modules. These are now durable conventions, not a one-time cleanup:

- **`App.jsx` is the shell only**: providers, the top-level `investorPage`/
  `adminPage` state machine, URL sync (`useLocation`/`useNavigate`), and page
  composition. New screens/features should NOT be added as new inline
  components in `App.jsx` — add a component under `src/features/<feature>/`
  and import it into `App.jsx`.
- **`src/features/<feature>/`**: one file per feature area (recommendations,
  connections, groups, portfolio, sharing, notifications, profile, discovery,
  admin, marketing, auth) holding that feature's page-level and modal
  components. A feature file may import from another feature file when a
  component is genuinely shared across features (e.g. `EditGroupModal` lives
  in `features/groups/Groups.jsx` and is used by both the investor Groups UI
  and `features/admin/Admin.jsx`) — prefer putting the shared component in
  the feature it most conceptually belongs to, and import it from there,
  rather than duplicating it. Avoid unnecessary cross-feature statically-eager
  imports into `features/admin/**`, since the admin bundle is lazy-loaded
  (see Performance below).
- **`src/components/common.jsx`**: small shared presentational atoms used
  across multiple features (badges, avatars, sparklines, etc.).
- **`src/constants/app.js`** and **`src/utils/*.js`**: pure constants and
  formatting/calculation helpers with no JSX, shared across features.
- **`src/hooks/index.js`**: shared hooks (`useIsMobile`, etc.).
- **`src/services/api/*.js`**: feature-scoped frontend API barrels
  (`connectionsApi.js`, `recommendationsApi.js`, `adminApi.js`, etc.). Import
  from here in feature code, not `src/db.js` directly — these re-export the
  relevant subset of `src/db.js`, which remains the single implementation
  (still funnelled through `callApi()`). New API calls should be added to
  `src/db.js` and re-exported from the appropriate `services/api/*.js`
  barrel.
- **Prohibition on browser-side Neon access**: never reintroduce
  `@neondatabase/serverless`, a `VITE_DATABASE_URL`, or any direct SQL call
  in `src/**`. All frontend data access goes through `services/api/*.js` ->
  `db.js` -> `callApi()` -> the server APIs in `api/`.
- **Performance**: `src/features/admin/**` is code-split via `React.lazy()`
  in `App.jsx` (wrapped in `<React.Suspense>`) since only admin-role users
  ever need it — keep it that way; avoid adding static (non-lazy) imports of
  `features/admin/Admin.jsx` from investor-facing feature files, since that
  defeats the split (Vite/Rollup will warn "dynamically imported ... but also
  statically imported" at build time if this regresses).
- **Independent data fetches must not be serialized.** Before adding a new
  `await` in a data-loading path (`AuthContext.jsx`'s auth-resolution effect,
  `App.jsx`'s post-login load effect, or similar), check whether it actually
  depends on the result of the call before it. If it doesn't, fire it
  concurrently (`Promise.all`/`allSettled`) instead of sequentially — this
  codebase has repeatedly picked up avoidable sequential round-trips on the
  home feed's critical path (auth blacklist-check + profile fetch; several
  independent feed-data calls) simply because each was added as "one more
  `await`" after the previous one, not because of a real dependency.

## Database / Neon conventions

- Always check `src/db.js` before writing or modifying any DB-touching code —
  it is the source of truth for table/column names and relationships. Do not
  infer schema from variable names elsewhere.
- SQL/schema files live under `supabase/`, but not all of them reflect the live
  schema — some are early prototypes or reference-only. Verify which file(s)
  currently apply by inspecting the repository (and `src/db.js` usage) rather
  than assuming any one file is authoritative.
- Keep DB access logic in `src/db.js`; keep UI/presentation logic in
  `App.jsx`/components. Don't duplicate query logic across both.

## Security rules

- **Never expose server-side secrets to client code.** `VITE_`-prefixed
  variables are public by definition — Vite compiles them into the client
  bundle, so anyone loading the app can read them. Only use `VITE_` for values
  that are intentionally public and non-sensitive. Never put secrets,
  credentials, or private API keys in a `VITE_` variable.
- **Browser-to-Neon direct access is prohibited.** Frontend code must not use
  `VITE_DATABASE_URL`, `@neondatabase/serverless`, or direct SQL/database
  connections. All application database access must go through server-side
  APIs (`api/data.js` and `api/_lib/handlers/*.js`). Authenticated APIs must
  derive identity from verified Firebase ID tokens (`requireUid`/
  `requireAdmin` in `api/_lib/auth.js`) — never from a client-supplied uid.
  Privileged operations must perform server-side authorization. API responses
  must use explicit field selection and must never use `SELECT *` or
  `RETURNING *`. Transitional fallbacks may be used only during migrations
  and must never bypass authentication or authorization decisions. (Phase 4
  security migration, completed — `src/supabaseClient.js` and
  `VITE_DATABASE_URL` no longer exist anywhere in this repo.)
- Never commit real credentials, API keys, or `.env` files. Only `.env.example`
  (with placeholder values) belongs in version control.
- **Never rotate, revoke, delete, or replace credentials, database roles,
  secrets, or production configuration without explicit user approval** —
  even if a change appears to require it (e.g. "fixing" an exposed key).
  Flag the issue and ask first.
- Treat any change that touches auth, admin-privilege checks, DB access
  patterns, or secret handling as security-sensitive: inspect the actual
  repository and configuration before acting, don't rely on assumptions or
  on what a doc says should be true, and flag the approach before
  implementing (see "Before you make changes" below).

## Environment variables

- `VITE_`-prefixed variables are compiled into the client bundle at build time
  and are visible to anyone who loads the app — treat them as public.
- Non-`VITE_` variables are server-only and must be set in the Vercel dashboard
  (or local `.env`, gitignored) — never referenced from frontend code.
- `.env.example` is the canonical list of required variables and must be kept
  in sync when env vars are added, renamed, or removed.

## Coding / change conventions

- This is a JavaScript (JSX) codebase — no TypeScript.
- `App.jsx` is the application shell (Phase 5) — see "Phase 5 architecture"
  above. Do not add new feature UI directly into `App.jsx`; add it under
  `src/features/<feature>/` instead. Do not undo the feature-oriented split
  "for cleanliness" — only restructure it further if explicitly asked to.
- Prefer small, targeted edits over broad rewrites, especially in `App.jsx` and
  `LoginPage.jsx`.
- Treat business calculations (ICI score, return/P&L calculations,
  recommendation status transitions) as sensitive — do not change their
  behavior without explicit instruction.
- **A posted idea is permanent — do not add a way to delete or edit one.**
  The credibility score only means anything if nobody can erase the calls
  that went wrong, so an author closes a position with `setExitSignal()`,
  which records the outcome rather than hiding it. The server's `delete-reco`
  action still exists and `src/db.js` still wraps it, but neither client
  re-exports or calls it, and a test in
  `mobile/src/services/api/recommendationsApi.test.js` fails if one starts
  to. **The existence of the endpoint is not permission to wire it up** —
  this bit an earlier session, which built a mobile Delete button from the
  API surface without checking that no web UI exposed it. Treat the same way
  any capability that exists server-side but is unreachable from the web UI:
  confirm it is intended before mirroring it onto mobile.
- Reuse existing helpers (e.g. `sendEmail`, `sendPush`, `track`) rather than
  writing new equivalents.

## Testing and validation

- `npm run lint` — ESLint (`.eslintrc.cjs`), scoped intentionally: `no-undef` and
  `react-hooks/rules-of-hooks` are errors (they catch real crash-class bugs —
  see the incident note below), everything else (unused vars, exhaustive-deps)
  is a warning so pre-existing code doesn't block new PRs. Run before pushing;
  it also runs automatically in CI on every PR.
- `npm test` — Vitest (`vitest.config.js`). Component tests use
  `@testing-library/react` + jsdom; pure-function tests need nothing extra.
  When you add a shared utility/component that's called from more than one
  place, add a test that exercises it with each caller's actual data shape —
  see `src/utils/format.test.js` for the pattern (a shared date-parsing helper
  crashed the whole app because two API endpoints represent "date"
  differently; the test locks in both shapes).
- `npm run build` — always verify after touching `App.jsx`, `LoginPage.jsx`, or
  other frontend code.
- `npm run smoke` — Playwright, real-browser check that the app shell loads
  with zero console/page errors (`tests/smoke/`). Needs `npx playwright install
  chromium` once, and a running server at `SMOKE_BASE_URL` (defaults to
  `http://localhost:4173`, i.e. `npm run build && npm run preview`). Scoped to
  what's testable without live Firebase/DB credentials — it catches
  bundle/deploy-level breakage, not authenticated-flow logic (that's what the
  Vitest component tests are for).
- **CI runs all of the above automatically — you do not need to ask for it.**
  `.github/workflows/ci.yml` runs lint + test + build + smoke on every pull
  request; `.github/workflows/post-deploy-smoke.yml` re-runs the smoke test
  against the live production URL immediately after every deploy to `main`
  completes. Treat a red CI check the same as a manually-caught bug — fix it
  before merging, don't bypass it.
- For backend (`api/`) changes, check that the relevant Node or Python function
  still runs / imports cleanly.
- **New top-level page, modal, or overlay in `App.jsx`**: wrap it in
  `SectionErrorBoundary` (`src/components/common.jsx`) as a matter of course,
  the same way you'd add an auth check. An uncaught render error with nothing
  above it to catch it unmounts React all the way to the app root — i.e. a
  bug in one page blanks the *entire* app, not just that page. This has
  already happened once (see incident note below); every existing page/modal
  in `App.jsx` is now wrapped — keep it that way for new ones.
- **Incident note** (2026-08): a shared date-parsing helper
  (`calcTargetDate`) assumed every caller passed a bare `YYYY-MM-DD` string;
  one API endpoint actually returned a full ISO timestamp for the same
  logical field, which produced an `Invalid Date` whose `.toISOString()`
  call threw — and with no error boundary above the Home Feed at the time,
  that single throw blanked the whole app. Both the missing boundary and the
  unsafe date parsing are fixed, but the lesson generalizes: (1) a function
  called from multiple render paths needs to be checked against *every*
  caller's actual data shape, not just the one it was written against, and
  (2) every page-level render needs a boundary above it regardless.

## Mobile OTA updates (EAS Update)

- `mobile/app.json` sets `runtimeVersion: { policy: "appVersion" }`. **Do not
  change this to the `fingerprint` policy.** Fingerprint derives the runtime
  version from a hash of the native dependency set computed in whichever
  environment runs it — and the EAS build server and the OTA update runner
  produce different hashes. The result is an update stamped with a runtime the
  installed app refuses, delivered to nobody, reporting no error anywhere: the
  device just keeps running its embedded bundle. That cost a full debugging
  cycle once; both mobile workflows now print the resolved runtimeVersion, and
  the update workflow fails outright if the policy is `fingerprint` again.
- The rule the policy implies: **bump `expo.version` in `mobile/app.json`
  whenever native code changes** (a new native dependency, a permission, an
  app.json plugin). That invalidates OTA for older binaries, which is correct —
  they cannot run the new native code. A JS-only change must NOT bump it, or
  the update stops reaching existing installs.
- JS-only fixes ship via the "Mobile — Publish OTA update" workflow and cost no
  EAS build. Only native changes need a build.

## Deployment considerations

- Frontend auto-deploys to GitHub Pages on every push to `main` — treat changes
  merged to `main` as effectively production.
- Backend functions in `api/` deploy to Vercel; changes there can affect a
  separately-versioned deployment, so verify env var expectations match what's
  configured in the Vercel dashboard rather than assuming.
- Do not modify `public/CNAME` or the `base` path in `vite.config.js` without
  understanding the GitHub Pages/custom-domain implications.

## Before you make changes

- Inspect existing code first — search `src/db.js`, `App.jsx`, and
  `docs/CLAUDE_HANDOVER.md` for existing functionality before adding something
  new; this codebase is large enough that the feature you're about to build may
  already exist. Verify against the actual code, since docs can go stale.
- Avoid unrelated refactors, renames, or cleanups — keep changes minimal and
  scoped to what was actually requested.
- Before implementing anything security-sensitive (auth, admin checks, secret
  handling, credential/config changes, DB access patterns) or
  production-impacting (deployment config, schema changes, anything affecting
  `main`), flag it and describe the intended approach before writing code —
  and inspect the real repository/configuration first rather than assuming.

## Merge & Deployment Guardrails

### 1. Scope check before merge

Before merging any PR into `main`:

- Confirm the PR is intentionally targeting `main`.
- Confirm the working tree is clean.
- Review `git diff main...HEAD --stat` and the complete diff.
- Confirm all changed files are related to the stated purpose of the PR.
- If unexpected files, unrelated functionality, or unexplained changes are
  found, STOP and report them. Do not merge.

### 2. Build and validation

Before merge:

- Run the project's production build (`npm run build` or the appropriate
  existing build command).
- Run all available automated tests, lint checks, syntax checks, and other
  repository validation that is practical.
- Existing unrelated warnings may be reported, but any NEW error introduced
  by the PR must block the merge.

If the production build fails, DO NOT merge.

### 3. Secret and credential protection

Before merge, inspect the diff for accidental exposure of:

- Firebase service-account credentials
- Neon/Postgres connection strings
- API keys or private tokens
- passwords
- `.env` files or other credential files
- private keys/certificates

Never commit or merge real credentials.
If a credential or secret is discovered, STOP immediately and report it.

### 4. Security review for auth/database/API changes

For any PR involving authentication, authorization, database access, API
endpoints, or user/profile data:

- Verify Firebase authentication tokens are validated server-side where
  required.
- Derive user identity/UID from the verified token, never from untrusted
  request parameters or request bodies.
- Do not introduce `VITE_DATABASE_URL` or other privileged database
  credentials into new browser/client code.
- Server APIs should use server-only database credentials.
- Avoid `SELECT *` and `RETURNING *` in APIs that return data to the browser.
  Explicitly select only the fields required by the API.
- Never expose sensitive fields such as SEBI information, consent
  information, claim tokens/status, private credentials, or other sensitive
  user data unless explicitly required and approved.
- Review CORS and authorization behavior for new authenticated endpoints.
- Do not modify production database schema, credentials, roles, or
  permissions without explicit user approval.

Any security concern that cannot be confidently resolved must block the
merge.

### 5. Database safety

For database-related changes:

- Do not perform destructive schema changes automatically.
- Do not drop tables, columns, indexes, or data without explicit approval.
- Do not modify production database credentials or permissions without
  explicit approval.
- Treat checked-in schema files as potentially stale if application code
  indicates otherwise; verify against the actual database when necessary.
- Prefer narrowly scoped queries and explicitly selected columns.

### 6. Deployment verification

After a successful merge:

- Verify that `main` contains the merged commit.
- Verify that the GitHub deployment/build starts and completes successfully.
- Verify the Vercel production deployment succeeds when Vercel is the
  production deployment platform.
- If deployment fails, STOP and report the failure. Do not automatically
  make additional fixes, create another PR, or repeatedly redeploy without
  user direction.

### 7. Human smoke testing

For major user-facing changes, identify 3–5 critical user journeys that
should be manually tested after deployment. Keep this list short and
practical. Do not require the user to manually test every small
implementation detail when automated validation already covers it. For
example, authentication/profile changes may require:

- existing-user login
- new-user signup
- profile update
- logout/login again

### 8. Automatic merge policy

Claude may merge a PR automatically when ALL of the following are true:

- PR targets `main`.
- Scope is understood and appropriate.
- No unexpected files or unrelated changes are present.
- Production build passes.
- Relevant automated tests/checks pass.
- No secrets or credentials are exposed.
- Security review passes for security-sensitive changes.
- No unapproved production schema/credential/permission changes are
  present.
- The PR is otherwise in a clean/mergeable state.

If any of these conditions fail or Claude is uncertain, DO NOT merge.
Report the specific issue and wait for user approval.

### 9. No autonomous repair loop

If a PR or deployment fails: detect → report → stop.

Do NOT automatically enter a cycle of change → deploy → fail → change again
→ deploy again without explicit user direction. Small, obvious fixes may be
proposed, but the user must decide whether to proceed when the failure is
material or the cause is uncertain.

### 10. Preserve the existing principle of small, logical phases

Do not split every tiny change into a separate PR merely for the sake of
process. Prefer:

logical phase → implementation → automated validation/security review →
Preview/production smoke test → merge

For larger migrations, divide work into sensible phases rather than dozens
of tiny commits.

Security migration changes should be implemented in logical batches rather
than unnecessarily tiny commits. Claude should perform comprehensive
automated build/security/diff validation before asking the developer for
manual testing. Manual testing should normally be consolidated at the
PR/Preview level. However, every migrated server endpoint must enforce
Firebase token authentication, derive identity from the verified token,
perform server-side authorization for privileged operations, explicitly
select/return only required fields, and never use SELECT * or RETURNING *.
Transitional API-first/direct-DB fallback is allowed only for infrastructure
failures and must never bypass an explicit authentication or authorization
denial.
