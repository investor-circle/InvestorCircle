-- Phase 14 — Market Views (Independent Market Contributor ideas).
--
-- An idea is now either
--   * a recommendation: recommendation_type Buy | Hold | Sell, published by a
--     Verified Research Publisher, or
--   * a Market View:    recommendation_type Positive | Neutral | Negative,
--     published by everyone else, with an editable per-idea disclosure.
--
-- NON-DESTRUCTIVE and idempotent. No existing idea is rewritten: historical
-- Buy/Sell rows are untouched.
--
-- !! RUN THIS BEFORE DEPLOYING THE CODE THAT READS ic_recommendations.disclosure
-- !! — the feed / profile / public-idea queries select that column.

BEGIN;

-- 1. Per-idea disclosure text (only Market Views set it; NULL for recommendations).
ALTER TABLE ic_recommendations ADD COLUMN IF NOT EXISTS disclosure TEXT;

-- 2. If recommendation_type is guarded by a CHECK constraint, widen it to the
--    six allowed values. (The checked-in schema files do not show one, so on
--    most databases this loop finds nothing and does nothing.)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'ic_recommendations'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%recommendation_type%'
  LOOP
    EXECUTE format('ALTER TABLE ic_recommendations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE ic_recommendations DROP CONSTRAINT IF EXISTS ic_recommendations_type_check;
ALTER TABLE ic_recommendations
  ADD CONSTRAINT ic_recommendations_type_check
  CHECK (recommendation_type IS NULL
         OR recommendation_type IN ('Buy', 'Hold', 'Sell', 'Positive', 'Neutral', 'Negative'))
  NOT VALID;   -- guards NEW rows only; never fails on legacy values already in the table

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'ic_recommendations' AND column_name = 'disclosure';
--   SELECT recommendation_type, count(*) FROM ic_recommendations GROUP BY 1;  -- unchanged counts
