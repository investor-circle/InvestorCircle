-- Phase 5.5 — Frictionless Signup & New-User Activation
--
-- Additive-only schema change for user_profiles. Run this against the live
-- Neon database before deploying the Phase 5.5 backend changes (no formal
-- migration runner exists in this repo — see CLAUDE.md "Database / Neon
-- conventions"; every other ad hoc column on user_profiles was added the
-- same way).
--
-- avatar_url: either a Google account photo URL (for Google sign-ins) or a
--   small base64 data: URI the user uploaded (see api/_lib/handlers/
--   lookups.js action=avatar-upload, size-capped client + server side to
--   keep DB row size small). NULL = no picture, fall back to the existing
--   avatar_color initials avatar.
--
-- onboarding_cv_done / onboarding_discover_done: gate the two-step new-user
-- activation flow (Build your Investor CV / Discover your Investor Circle).
-- DEFAULT true backfills existing rows as "already handled" so established
-- users never see the new activation flow; new signups explicitly write
-- false in api/profile/sync.js and api/profile/signup.js.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_cv_done BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_discover_done BOOLEAN NOT NULL DEFAULT true;
