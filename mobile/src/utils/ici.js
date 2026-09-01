/**
 * ICI (Investor Credibility Index).
 *
 * PORTED VERBATIM from the web app's src/db.js computeIci(). This is the
 * product's headline metric — the number a user is judged by — so the two
 * clients must never disagree about it by a single point. Copied rather than
 * reimplemented for the same reason as trending.js/whatYouMissed.js: Metro's
 * projectRoot cannot reach outside mobile/, and a paraphrase would drift.
 *
 * Pure: no imports, no service calls. Fed by getInvestorIciBatch() rows,
 * mapped the way Connections.jsx maps them (see iciFromStatsRow below).
 */

export function computeIci({ years_history, total, hit_rate_pct, median_return, risk_adjusted_return, deleted_count }) {
  const yrs    = Math.max(Number(years_history)       || 0, 0);
  const recs   = Math.max(Number(total)               || 0, 0);
  const hr     = Math.max(Number(hit_rate_pct)        || 0, 0);
  const med    = Math.max(Number(median_return)       || 0, 0);
  const ra     = Math.max(Number(risk_adjusted_return)|| 0, 0);
  const dels   = Math.max(Number(deleted_count)       || 0, 0);

  const trackLen    = Math.min(yrs  / 3,  1) * 15;   // 3 yrs = full marks
  const volume      = Math.min(recs / 20, 1) * 15;   // 20 recs = full marks
  const hitRate     = (hr / 100)               * 20;
  const medianRet   = Math.min(med / 15, 1)    * 15;  // 15% median = full
  const riskAdj     = Math.min(ra  / 2,  1)    * 15;  // Sharpe 2 = full
  const transparency = (1 - Math.min(dels / Math.max(recs, 1), 1)) * 10;
  const profileVerif = 10; // upgraded later when identity verification is built

  const score = Math.min(Math.round(trackLen + volume + hitRate + medianRet + riskAdj + transparency + profileVerif), 100);
  const band  = score >= 75 ? 'Strong' : score >= 55 ? 'Good' : score >= 35 ? 'Building' : 'Early';

  return {
    score, band,
    components: [
      { label: 'Track record length',   score: Math.round(trackLen),    max: 15 },
      { label: 'Idea volume',           score: Math.round(volume),      max: 15 },
      { label: 'Hit rate',              score: Math.round(hitRate),      max: 20 },
      { label: 'Median return',         score: Math.round(medianRet),    max: 15 },
      { label: 'Risk-adjusted return',  score: Math.round(riskAdj),     max: 15 },
      { label: 'Transparency',          score: Math.round(transparency), max: 10 },
      { label: 'Profile verification',  score: Math.round(profileVerif), max: 10 },
    ],
  };
}


/**
 * Map one investor-ici-batch row onto computeIci()'s input.
 *
 * Mirrors the mapping in the web Connections.jsx useIciBatch: the endpoint
 * returns raw counts (wins/closed) and the hit rate + risk-adjusted return
 * are derived here, not in SQL, so the formula stays in one place.
 */
export function iciFromStatsRow(row) {
  if (!row) return null;
  const closed = Number(row.closed) || 0;
  const wins = Number(row.wins) || 0;
  const hitPct = closed > 0 ? (wins / closed) * 100 : 0;
  const medianRet = Number(row.median_ret) || 0;
  const stddev = Number(row.ret_stddev) || 0;
  // Sharpe-like ratio; undefined spread means no risk signal, not infinite.
  const riskAdj = stddev > 0 ? medianRet / stddev : 0;

  return {
    ...computeIci({
      years_history: Number(row.years_history) || 0,
      total: row.total,
      hit_rate_pct: hitPct,
      median_return: medianRet,
      risk_adjusted_return: riskAdj,
      deleted_count: 0,
    }),
    total: Number(row.total) || 0,
  };
}

/** uid -> ici, for a batch of stats rows. */
export function iciMapFromStats(stats) {
  const map = {};
  for (const row of stats || []) {
    if (!row?.uid) continue;
    map[row.uid] = iciFromStatsRow(row);
  }
  return map;
}
