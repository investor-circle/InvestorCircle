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

- **Frontend**: React 18 + Vite 5, single-page app with hash-based routing.
  `src/App.jsx` is a large monolith containing most UI components and business
  logic; `src/services/` holds focused client helpers (CAS import, market data,
  PAN import, price fetching).
- **Backend**: Vercel serverless functions in `api/`, mixed Node.js and Python
  3.9. Used for email (Resend), push notifications, price proxying, CAS PDF
  parsing, and Firebase-Admin-based password reset.
- **Database**: Postgres via Neon, queried directly from the frontend using
  `@neondatabase/serverless` (no general-purpose backend API layer). All DB
  query/helper functions are centralized in `src/db.js`; `src/supabaseClient.js`
  exports the Neon client (named "supabase" for legacy reasons — this project
  does not use Supabase).
- **Auth**: Firebase Authentication (email/password). Auth state and profile
  sync live in `src/AuthContext.jsx`; login/signup/reset UI in `src/LoginPage.jsx`.
  Password reset is server-mediated via `api/reset.py` using the Firebase Admin
  SDK.
- **Deployment**: Frontend deploys to GitHub Pages via
  `.github/workflows/deploy.yml` on push to `main`; backend functions deploy to
  Vercel. `public/CNAME` pins the custom domain — do not remove it.

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
- `VITE_DATABASE_URL` (a Neon connection string currently baked into the
  client bundle) is a known legacy security issue, not an accepted design
  choice. Do not extend this pattern to other secrets, and do not treat it as
  precedent — it is intended to be removed in favor of server-side DB access
  once the app moves toward production use.
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
- `App.jsx` is a large, intentional monolith. Do not refactor it into separate
  files or components "for cleanliness" — only restructure it if explicitly
  asked to.
- Prefer small, targeted edits over broad rewrites, especially in `App.jsx` and
  `LoginPage.jsx`.
- Treat business calculations (ICI score, return/P&L calculations,
  recommendation status transitions) as sensitive — do not change their
  behavior without explicit instruction.
- Reuse existing helpers (e.g. `sendEmail`, `sendPush`, `track`) rather than
  writing new equivalents.

## Testing and validation

- There is no automated test suite in this repo (no test framework, scripts, or
  test files configured) — do not assume one exists; verify before relying on
  it.
- After any change to `App.jsx` or `LoginPage.jsx` (or other frontend code),
  verify the build compiles: `npx vite build`.
- For backend (`api/`) changes, check that the relevant Node or Python function
  still runs / imports cleanly; there is no CI test step to rely on.

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
