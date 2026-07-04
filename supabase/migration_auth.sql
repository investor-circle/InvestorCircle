-- InvestorCircle — Auth migration
-- Run this in the Neon SQL Editor AFTER schema.sql.
-- Adds the two tables needed for Firebase Auth + data persistence.
--
-- If you get "already exists" errors, the migration ran before — that's fine, skip it.

-- ── User profiles ─────────────────────────────────────────────────────────────
-- Keyed by Firebase UID (a text string, e.g. "abc123xyz789").
-- Separate from the `profiles` table in schema.sql which uses UUID keys.
CREATE TABLE IF NOT EXISTS user_profiles (
  id          TEXT PRIMARY KEY,             -- Firebase UID
  email       TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL,
  is_admin    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Per-user data store ────────────────────────────────────────────────────────
-- Persists each user's recommendations, contacts, and groups as JSON blobs.
-- Simple and flexible for a prototype — upgrade to normalized tables when ready.
--
-- data_type values used by the app:
--   'recs_received'  — recommendations the user has received
--   'recs_made'      — recommendations the user has made
--   'contacts'       — the user's contact list
--   'groups'         — the user's groups
CREATE TABLE IF NOT EXISTS user_data (
  user_id    TEXT NOT NULL,                 -- Firebase UID
  data_type  TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, data_type)
);

CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data (user_id);

-- ── Trigger: auto-update updated_at on user_profiles ─────────────────────────
-- Reuses the set_updated_at() function created by schema.sql
CREATE TRIGGER IF NOT EXISTS trg_user_profiles_updated
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
