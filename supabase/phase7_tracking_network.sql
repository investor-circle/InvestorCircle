-- ============================================================
-- InvestorCircle — Phase 7: Tracking visibility & smart tracking
-- notifications on the Network page.
--
-- Run this in the Neon SQL Editor AFTER phase6_relationships.sql.
--
-- Additive only — no destructive changes, no data loss:
--   - Adds composite indexes on user_tracking to support efficient
--     newest-first, paginated "Tracking me" / "I'm tracking" lists at
--     creator scale (hundreds/thousands of trackers).
--   - Adds a partial unique index on notifications that backs the
--     "smart/bundled tracking notification" mechanism (see
--     api/_lib/handlers/tracking.js): at most one UNREAD
--     type='tracking_new' notification may exist per recipient at a
--     time, so a burst of new trackers atomically bumps a single
--     notification's count instead of creating one row per tracker.
--     Marking it read (or it not existing yet) lets the next new
--     tracker start a fresh individual notification again.
-- ============================================================

-- Newest-first pagination for "Tracking me" (who tracks a given user) and
-- "I'm tracking" (who a given user tracks). The existing single-column
-- indexes from phase6 (idx_user_tracking_tracked / idx_user_tracking_tracker)
-- still work but force an extra sort step under LIMIT/OFFSET at scale —
-- these composite indexes let Postgres satisfy "WHERE x = ... ORDER BY
-- created_at DESC LIMIT n" directly from the index.
CREATE INDEX IF NOT EXISTS idx_user_tracking_tracked_created ON user_tracking(tracked_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_tracking_tracker_created ON user_tracking(tracker_id, created_at DESC);

-- Singleton "unread bundle" index for tracking_new notifications — the
-- ON CONFLICT target used by the atomic upsert in tracking.js's track
-- action. A partial unique index on a mutable predicate (is_read) is a
-- standard, fully-supported Postgres pattern; Postgres re-evaluates the
-- predicate on every write, so a row falls in/out of the index as its
-- is_read value changes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_tracking_singleton
  ON notifications(user_id)
  WHERE type = 'tracking_new' AND is_read = false;

-- Speeds up "does this user already have an in-progress tracking bundle"
-- checks and general per-user/per-type notification queries.
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created ON notifications(user_id, type, created_at DESC);

-- New notification type used by this phase (notifications.type is
-- free-text — no schema change needed beyond the indexes above):
--   'tracking_new' — someone started tracking you. metadata shape:
--     { count: <int>, leadName: <text> }
--   count=1            -> "<leadName> started tracking you"
--   count>1            -> "<leadName> + <count-1> new investors started tracking you"
-- from_user_id is updated to the MOST RECENT tracker on every bundle
-- bump (so the notification avatar/name stays current); reference_id is
-- unused for this type — clicking it always deep-links to
-- Network -> Tracking me, not to a specific record.
