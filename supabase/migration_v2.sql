-- ============================================================
-- InvestorCircle — Shared Data Model (v2)
-- Run this in the Neon SQL Editor AFTER schema.sql and migration_auth.sql.
-- This replaces the per-user JSON blob approach with proper
-- relational tables that all users read and write together.
-- ============================================================

-- ── CONNECTIONS ───────────────────────────────────────────────────────────────
-- One row per pair. requester_id sent the request; addressee_id received it.
-- status: 'pending' → 'accepted' or 'rejected'
-- Rule: (A→B) and (B→A) are the SAME connection — only one row is ever created.
CREATE TABLE IF NOT EXISTS connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  addressee_id  TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_connections_requester ON connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_addressee ON connections(addressee_id);
CREATE INDEX IF NOT EXISTS idx_connections_pair     ON connections(requester_id, addressee_id);

-- ── GROUPS ────────────────────────────────────────────────────────────────────
-- Shared group definitions. One row per group; all members read the same row.
-- Named ic_groups to avoid conflict with Postgres reserved word 'groups'.
CREATE TABLE IF NOT EXISTS ic_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6d5df5',
  created_by  TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ic_groups_created_by ON ic_groups(created_by);

-- Group membership: one row per (group, user) pair.
-- role: 'admin' (can rename/delete/add members) or 'member'
-- status: 'active' or 'exited' (soft-delete so history is preserved)
CREATE TABLE IF NOT EXISTS group_members (
  group_id    UUID NOT NULL REFERENCES ic_groups(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  status      TEXT NOT NULL DEFAULT 'active'  CHECK (status IN ('active','exited')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at   TIMESTAMPTZ,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user   ON group_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_group_members_group  ON group_members(group_id, status);

-- ── RECOMMENDATIONS ───────────────────────────────────────────────────────────
-- ONE row per investment idea. Shared across all recipients.
-- Updating current_price, exit_signal etc. on this row is immediately
-- visible to every recipient — no duplication across user blobs.
CREATE TABLE IF NOT EXISTS ic_recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommender_id  TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  asset_name      TEXT NOT NULL,
  ticker          TEXT NOT NULL,
  asset_class     TEXT NOT NULL DEFAULT 'Equity',
  reco_price      NUMERIC,         -- price at time of recommendation
  current_price   NUMERIC,         -- updated periodically (Finnhub refresh)
  target_price    NUMERIC,
  horizon         TEXT CHECK (horizon IN ('3m','6m','12m','>2Y')),
  target_date     DATE,            -- calculated from created_at + horizon
  thesis          TEXT,
  exit_signal     BOOLEAN NOT NULL DEFAULT FALSE,
  exit_date       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recs_recommender ON ic_recommendations(recommender_id);
CREATE INDEX IF NOT EXISTS idx_recs_ticker      ON ic_recommendations(ticker);
CREATE INDEX IF NOT EXISTS idx_recs_created     ON ic_recommendations(created_at DESC);

-- Delivery: one row per recipient per recommendation.
-- This records HOW the recommendation reached the user (direct / via group / forwarded)
-- and stores that user's personal interaction (invested, reaction, hidden).
CREATE TABLE IF NOT EXISTS recommendation_deliveries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id     UUID NOT NULL REFERENCES ic_recommendations(id) ON DELETE CASCADE,
  delivered_to_user_id  TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  -- HOW it arrived
  via_type              TEXT NOT NULL DEFAULT 'direct'
                          CHECK (via_type IN ('direct','group','forward')),
  via_group_id          UUID REFERENCES ic_groups(id) ON DELETE SET NULL,
  shared_by_id          TEXT REFERENCES user_profiles(id), -- who forwarded (null = direct from recommender)
  -- User's personal interaction
  is_invested           BOOLEAN NOT NULL DEFAULT FALSE,
  invested_price        NUMERIC,
  invested_at           TIMESTAMPTZ,
  reaction              TEXT CHECK (reaction IN ('like','dislike')),
  is_hidden             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Each user receives a recommendation exactly once
  UNIQUE (recommendation_id, delivered_to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_deliveries_user   ON recommendation_deliveries(delivered_to_user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_rec    ON recommendation_deliveries(recommendation_id);

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
-- Push-style: when an action occurs, rows are inserted for target users.
-- The app polls on login and marks rows read when user sees them.
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
    -- 'connection_request'  → someone wants to connect with you
    -- 'connection_accepted' → someone accepted your request
    -- 'connection_rejected' → someone rejected your request
    -- 'group_added'         → you were added to a group
    -- 'group_member_exit'   → a member left your group
    -- 'recommendation'      → a recommendation was shared with you
    -- 'exit_signal'         → recommender issued exit on a rec you hold
  from_user_id  TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
  reference_id  TEXT,   -- UUID of the related connection/group/recommendation
  metadata      JSONB NOT NULL DEFAULT '{}', -- extra data (ticker, group name, etc.)
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ── SHARING PREFERENCES ───────────────────────────────────────────────────────
-- Per-user configuration of what they share with each contact or group.
-- Replaces the per-user JSON blob in user_data.
CREATE TABLE IF NOT EXISTS sharing_preferences (
  user_id               TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  target_id             TEXT NOT NULL, -- other user_id or ic_groups.id (cast to text)
  target_type           TEXT NOT NULL CHECK (target_type IN ('user','group')),
  visibility            TEXT NOT NULL DEFAULT 'off'
                          CHECK (visibility IN ('off','all','selected')),
  level                 TEXT NOT NULL DEFAULT 'names'
                          CHECK (level IN ('names','full')),
  selected_holding_ids  TEXT[] NOT NULL DEFAULT '{}',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id)
);

-- ── AUTO-UPDATE TIMESTAMPS ────────────────────────────────────────────────────
-- Reuses the set_updated_at() function from schema.sql (already created).
DO $$ BEGIN
  CREATE TRIGGER trg_connections_updated
    BEFORE UPDATE ON connections
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_ic_groups_updated
    BEFORE UPDATE ON ic_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_ic_recommendations_updated
    BEFORE UPDATE ON ic_recommendations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_deliveries_updated
    BEFORE UPDATE ON recommendation_deliveries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
