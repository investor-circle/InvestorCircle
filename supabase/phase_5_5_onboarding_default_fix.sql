-- Phase 5.5 — fix onboarding column defaults for NEW rows
--
-- The original migration (phase_5_5_onboarding.sql) used
-- `DEFAULT true` on both onboarding columns so that adding the columns
-- would backfill all EXISTING rows as "already onboarded" without a second
-- pass. That worked for the one-time backfill, but the default stays on
-- the column permanently at the schema level — so any INSERT into
-- user_profiles that doesn't explicitly list these two columns (an older
-- deployed version of api/profile/sync.js or api/profile/signup.js, a
-- stale build, any other insert path) silently gets `true` from the column
-- default instead of `false`, making a brand-new signup look
-- "already onboarded" from the moment its row is created — the setup
-- checklist then never appears for that user, even though they're new.
--
-- This does NOT touch any existing row's *value* — only what a future
-- INSERT gets when it omits these columns. Existing users keep whatever
-- value the first migration backfilled (true); anyone currently mid-signup
-- keeps whatever their own INSERT already wrote.
ALTER TABLE user_profiles ALTER COLUMN onboarding_cv_done SET DEFAULT false;
ALTER TABLE user_profiles ALTER COLUMN onboarding_discover_done SET DEFAULT false;
