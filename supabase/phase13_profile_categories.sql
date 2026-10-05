-- Phase 13 — profile categories reduced to two.
--
--   Verified Research Publisher     (verified_research_publisher)
--   Independent Market Contributor  (independent_market_contributor)
--
-- Replaces self_directed / enthusiast / sebi_ra / sebi_ria. Mapping:
--   sebi_ra        -> verified_research_publisher
--   self_directed  -> independent_market_contributor
--   enthusiast     -> independent_market_contributor
--   sebi_ria       -> independent_market_contributor
--   NULL / unknown -> independent_market_contributor
--   sebi_ra + sebi_approval_status 'rejected' -> independent_market_contributor
--     (a failed verification is not a Research Publisher; the rejected status
--     and submitted details are kept)
--
-- NON-DESTRUCTIVE. No row, column or option is deleted:
--   * sebi_approval_status / sebi_reg_number / sebi_reg_valid_till /
--     sebi_firm_name / sebi_submitted_at / sebi_approved_at are NOT touched,
--     so a former Research Analyst keeps exactly the verification state they
--     had (approved stays approved, pending stays pending, not_applied stays
--     not_applied). Nobody is promoted to verified.
--   * Former Investment Advisers keep their stored SEBI values too, but the
--     app only shows SEBI verification for the Verified Research Publisher
--     category, so they display as Independent Market Contributor. Saving a
--     profile as a contributor never clears SEBI details (audit history).
--   * Retired registration_status_options rows are deactivated, not deleted.
--
-- Idempotent — safe to re-run. Run once against Neon, in this order:
--   1. this migration   2. deploy the code   (either order works: the app and
--   API both understand the legacy codes until this has run).

BEGIN;

-- 1. Existing users.
UPDATE user_profiles
SET registration_status = CASE
      WHEN registration_status = 'sebi_ra' THEN 'verified_research_publisher'
      ELSE 'independent_market_contributor'
    END
WHERE registration_status IS DISTINCT FROM 'verified_research_publisher'
  AND registration_status IS DISTINCT FROM 'independent_market_contributor';

-- 1b. Lifecycle: a publisher whose SEBI verification was rejected is an
--     Independent Market Contributor. Only the category changes; the rejected
--     status and every submitted SEBI detail stay on the row for audit.
UPDATE user_profiles
SET registration_status = 'independent_market_contributor'
WHERE registration_status = 'verified_research_publisher'
  AND sebi_approval_status = 'rejected';

-- 2. New rows that omit the column.
ALTER TABLE user_profiles
  ALTER COLUMN registration_status SET DEFAULT 'independent_market_contributor';

-- 3. The selectable options (read by the web and mobile selectors).
UPDATE registration_status_options
SET is_active = false
WHERE code NOT IN ('verified_research_publisher', 'independent_market_contributor');

UPDATE registration_status_options
SET label = 'Verified Research Publisher',
    description = 'SEBI-registered Research Analysts and Research Entities who publish professional investment research.',
    requires_sebi_fields = true, is_active = true, sort_order = 1
WHERE code = 'verified_research_publisher';

INSERT INTO registration_status_options (code, label, description, requires_sebi_fields, is_active, sort_order)
SELECT 'verified_research_publisher', 'Verified Research Publisher',
       'SEBI-registered Research Analysts and Research Entities who publish professional investment research.',
       true, true, 1
WHERE NOT EXISTS (SELECT 1 FROM registration_status_options WHERE code = 'verified_research_publisher');

UPDATE registration_status_options
SET label = 'Independent Market Contributor',
    description = 'Investors and market participants who share independent views, analysis and commentary on companies and markets.',
    requires_sebi_fields = false, is_active = true, sort_order = 2
WHERE code = 'independent_market_contributor';

INSERT INTO registration_status_options (code, label, description, requires_sebi_fields, is_active, sort_order)
SELECT 'independent_market_contributor', 'Independent Market Contributor',
       'Investors and market participants who share independent views, analysis and commentary on companies and markets.',
       false, true, 2
WHERE NOT EXISTS (SELECT 1 FROM registration_status_options WHERE code = 'independent_market_contributor');

COMMIT;

-- Verify (expect only the two new codes; SEBI statuses unchanged):
--   SELECT registration_status, sebi_approval_status, count(*)
--   FROM user_profiles GROUP BY 1, 2 ORDER BY 1, 2;
--   SELECT code, is_active, sort_order FROM registration_status_options ORDER BY is_active DESC, sort_order;
