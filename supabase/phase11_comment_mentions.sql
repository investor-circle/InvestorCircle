-- ============================================================
-- InvestorCircle — @mention tagging in comments (Phase 11)
-- Run this in the Neon SQL Editor. Additive only — safe to run
-- against the live database (adds one nullable-by-default column).
-- ============================================================

-- Resolved mentions for a comment: [{ "id": "<user_id>", "username": "<username>" }, ...].
-- Populated server-side from @username tokens found in the comment text
-- (api/_lib/handlers/engagement.js) — never trusted from the client directly.
-- Used to (a) know which @tokens in the raw text are real mentions worth
-- rendering as profile links, and (b) know who to notify.
ALTER TABLE recommendation_comments
  ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]';
