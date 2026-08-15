-- Phase 5.5 (revised) — mandatory consent + username at signup
--
-- Product decision change: username and consent are no longer a skippable
-- post-signup nudge. Both are now REQUIRED before a new account can be used
-- — collected as part of the email signup form (consent shown on "Create
-- account" click, before the Firebase account is created) or, for Google
-- sign-in (which has no form step), as a mandatory one-time gate shown right
-- after first authentication (see src/features/onboarding/Onboarding.jsx,
-- MandatorySetupGate).
--
-- consent_terms_accepted / consent_data_accepted: same two consent
-- statements already used (client-side only, never previously persisted —
-- see api/_lib/handlers/claim-profile.js, which never accepted or stored
-- them either) in the creator-claim flow's consent checkboxes
-- (src/features/profile/Profile.jsx ProfileEditModal, claimMode):
--   "I agree to the Terms of Service and Privacy Policy"
--   "I consent to myInvestorCircle storing and publicly displaying my
--    investment recommendations"
-- consent_accepted_at: audit timestamp for when both were accepted.
--
-- DEFAULT true backfills EXISTING rows only, at ALTER TABLE time, the same
-- pattern as onboarding_cv_done/onboarding_discover_done in
-- phase_5_5_onboarding.sql — established users are not retroactively forced
-- through a consent screen by this change. This is a product/scope decision,
-- not a legal one: only going forward (new signups) is consent newly
-- enforced by this PR. Whether existing users should ALSO be asked to
-- explicitly (re)consent is a separate decision this migration does not
-- make — flag if that's wanted and it can be handled as its own follow-up.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS consent_terms_accepted BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS consent_data_accepted BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ;

-- As with onboarding_cv_done/onboarding_discover_done: the DEFAULT above is
-- only a one-time backfill trick for existing rows at ALTER TABLE time — it
-- would otherwise also apply to any future INSERT that doesn't explicitly
-- list these columns (see phase_5_5_onboarding_default_fix.sql, which fixed
-- exactly this class of bug for the onboarding columns). Flip the
-- going-forward default to false immediately so a new signup that somehow
-- omits these columns fails closed (not consented) rather than open.
ALTER TABLE user_profiles ALTER COLUMN consent_terms_accepted SET DEFAULT false;
ALTER TABLE user_profiles ALTER COLUMN consent_data_accepted SET DEFAULT false;
