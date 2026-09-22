-- ============================================================
-- InvestorCircle — Phase 12: Member tags (Founding Member, and
-- future tag types — Verified, etc.)
--
-- Run this in the Neon SQL Editor. Additive only — no destructive changes.
--
-- One small relational table instead of a one-off boolean column
-- (is_admin/is_unclaimed's pattern on user_profiles) because the product
-- requirement is explicitly "more tag types later" (Verified, etc.) — a
-- new tag type should never need another migration. tag_type is free-text
-- by design (mirrors notifications.type's own free-text convention in this
-- schema) with the allowed set enforced in code
-- (api/_lib/handlers/admin-config.js's ALLOWED_TAG_TYPES), the same
-- pattern FEATURE_KEYS/CONTACT_CATEGORIES already use in
-- api/_lib/handlers/lookups.js.
--
-- A user can hold more than one tag at once (Founding Member AND Verified
-- both true is a real future case), hence one row per (user, tag) rather
-- than a single nullable column.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_tags (
  user_id     TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  tag_type    TEXT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by  TEXT,                    -- admin's user_profiles.id, for audit; not FK-enforced to survive that admin later being deleted
  PRIMARY KEY (user_id, tag_type)
);

-- Every "who has tag X" read (all-users admin table, profile/public-profile
-- lookups, the founding-member-ids lookup batch) filters by tag_type —
-- the primary key above already gives Postgres a usable index for both
-- (user_id, tag_type) and tag_type-alone lookups, so no separate index is
-- needed.
