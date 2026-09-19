// Copied verbatim from src/db.js's computeIci — a pure function of already-
// public profile summary data (src/features/profile/Profile.jsx calls it
// the same way, omitting deleted_count too: ideas can never be deleted, see
// the main repo's CLAUDE.md, so it's always 0 in practice). Duplicated
// rather than shared across two separate, independently-deployed projects,
// same as computeConsensus in lib/consensus.js.
export function computeIci({ years_history, total, hit_rate_pct, median_return, risk_adjusted_return, deleted_count }) {
  const yrs    = Math.max(Number(years_history)       || 0, 0);
  const recs   = Math.max(Number(total)               || 0, 0);
  const hr     = Math.max(Number(hit_rate_pct)        || 0, 0);
  const med    = Math.max(Number(median_return)       || 0, 0);
  const ra     = Math.max(Number(risk_adjusted_return)|| 0, 0);
  const dels   = Math.max(Number(deleted_count)        || 0, 0);

  const trackLen    = Math.min(yrs  / 3,  1) * 15;
  const volume      = Math.min(recs / 20, 1) * 15;
  const hitRate     = (hr / 100)               * 20;
  const medianRet   = Math.min(med / 15, 1)    * 15;
  const riskAdj     = Math.min(ra  / 2,  1)    * 15;
  const transparency = (1 - Math.min(dels / Math.max(recs, 1), 1)) * 10;
  const profileVerif = 10;

  const score = Math.min(Math.round(trackLen + volume + hitRate + medianRet + riskAdj + transparency + profileVerif), 100);
  const band  = score >= 75 ? 'Strong' : score >= 55 ? 'Good' : score >= 35 ? 'Building' : 'Early';

  return { score, band };
}
