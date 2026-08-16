-- ============================================================
-- InvestorCircle — Phase 6: Track / Connect / Circle relationships
--
-- Run this in the Neon SQL Editor AFTER migration_v2.sql (and any later
-- phase_5_5_*.sql files already applied).
--
-- This migration is purely additive and backward compatible:
--   - Existing `connections` (Connect) tables are untouched.
--   - `ic_groups` / `group_members` (the existing Group model) are reused
--     for Circles rather than replaced — new nullable/defaulted columns are
--     added so every EXISTING group becomes a PRIVATE circle by default.
--     No existing group becomes publicly discoverable/joinable as a side
--     effect of running this migration.
-- ============================================================

-- ── TRACKING ─────────────────────────────────────────────────────────────
-- One-way, no-approval "Track" relationship (replaces the old Follow
-- concept for investor/creator relationships). tracker_id follows/tracks
-- tracked_id's ideas/content. Untracking is a plain DELETE.
CREATE TABLE IF NOT EXISTS user_tracking (
  tracker_id  TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  tracked_id  TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tracker_id, tracked_id),
  CHECK (tracker_id != tracked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_tracking_tracked ON user_tracking(tracked_id);
CREATE INDEX IF NOT EXISTS idx_user_tracking_tracker ON user_tracking(tracker_id);

-- ── CIRCLES (ic_groups extended) ────────────────────────────────────────
-- "Circle" is the product-facing rename of the existing Group concept —
-- reusing ic_groups/group_members rather than introducing a parallel
-- table. circle_type distinguishes Private (owner-managed membership,
-- not discoverable) from Public (subscribable, with join requests and
-- invite links).
ALTER TABLE ic_groups ADD COLUMN IF NOT EXISTS circle_type  TEXT NOT NULL DEFAULT 'private' CHECK (circle_type IN ('private','public'));
ALTER TABLE ic_groups ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE ic_groups ADD COLUMN IF NOT EXISTS slug         TEXT;
ALTER TABLE ic_groups ADD COLUMN IF NOT EXISTS invite_code  TEXT;
-- `tier` is unused today (no payments in this phase) — reserved so a
-- future Free -> Premium -> Paid Circle upgrade doesn't need a schema
-- change, only a billing integration reading this column.
ALTER TABLE ic_groups ADD COLUMN IF NOT EXISTS tier         TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','premium'));

-- Backfill slug/invite_code for pre-existing groups (idempotent — only
-- fills rows where the new column is still NULL from the ADD COLUMN above).
UPDATE ic_groups
SET slug = lower(regexp_replace(regexp_replace(COALESCE(name,'circle'), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')) || '-' || substr(id::text, 1, 8)
WHERE slug IS NULL;
UPDATE ic_groups SET invite_code = replace(gen_random_uuid()::text, '-', '')
WHERE invite_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ic_groups_slug        ON ic_groups(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ic_groups_invite_code ON ic_groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_ic_groups_public_type ON ic_groups(circle_type) WHERE circle_type = 'public';

-- ── CIRCLE JOIN REQUESTS ─────────────────────────────────────────────────
-- Pending-approval subscribe/request-to-join flow for Public circles.
-- Direct adds by the owner (private circles, or eligible people on public
-- circles) skip this table entirely and write straight to group_members.
CREATE TABLE IF NOT EXISTS circle_join_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES ic_groups(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  source      TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct','invite_link')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_circle_join_requests_group ON circle_join_requests(group_id, status);
CREATE INDEX IF NOT EXISTS idx_circle_join_requests_user  ON circle_join_requests(user_id);

DO $$ BEGIN
  CREATE TRIGGER trg_circle_join_requests_updated
    BEFORE UPDATE ON circle_join_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Notification types used by this phase (notifications.type is free-text —
-- no schema change needed): 'circle_join_request', 'circle_join_approved',
-- 'circle_join_rejected'. The existing 'group_added' type is reused for
-- direct-add-to-circle (private or public) — only its display label
-- changes client-side, from "added you to a group" to "added you to a
-- Circle".
