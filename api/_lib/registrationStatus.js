/**
 * Profile categories (user_profiles.registration_status).
 *
 * Exactly two exist. The three-/four-way split that preceded them
 * (self_directed / enthusiast / sebi_ra / sebi_ria) is retired; the legacy
 * codes are still ACCEPTED on the way in and mapped, so a client that has not
 * yet updated (an older mobile build, a cached web bundle) cannot write a
 * category the app no longer understands. They are never written back.
 *
 * Mirrored client-side in src/constants/app.js and mobile/src/utils/profile.js
 * — the three must agree; see supabase/phase13_profile_categories.sql for the
 * data migration that applies the same mapping to existing rows.
 */
export const REG_PUBLISHER = 'verified_research_publisher';
export const REG_CONTRIBUTOR = 'independent_market_contributor';
export const REG_STATUSES = [REG_PUBLISHER, REG_CONTRIBUTOR];

const LEGACY_MAP = {
  sebi_ra: REG_PUBLISHER,
  self_directed: REG_CONTRIBUTOR,
  enthusiast: REG_CONTRIBUTOR,
  sebi_ria: REG_CONTRIBUTOR,
};

/** Any stored/submitted value -> a current code, or null if unrecognised. */
export function normalizeRegStatus(value) {
  const v = String(value || '').trim();
  if (REG_STATUSES.includes(v)) return v;
  return LEGACY_MAP[v] || null;
}

/**
 * The category a profile effectively holds. The stored registration_status is
 * the category the member CHOSE; sebi_approval_status is the separate
 * verification outcome. A publisher whose verification was rejected is
 * effectively an Independent Market Contributor (their SEBI details stay on
 * the row for audit). Pending / not-yet-reviewed publishers stay publishers.
 */
export function effectiveRegStatus(status, approvalStatus) {
  const s = normalizeRegStatus(status) || REG_CONTRIBUTOR;
  return s === REG_PUBLISHER && approvalStatus === 'rejected' ? REG_CONTRIBUTOR : s;
}

/** Only the Verified Research Publisher category carries SEBI fields. */
export function isPublisherStatus(value) {
  return normalizeRegStatus(value) === REG_PUBLISHER;
}
