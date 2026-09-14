// Copied verbatim from src/utils/format.js in the main repo (computeConsensus
// and consensusStrengthColor) rather than shared across two separate,
// independently-deployed projects. Keep these two copies identical — this is
// a pure function of already-public data (recommendation_type only), not the
// same class of sensitive calculation as ICI/return_pct (which arrive
// pre-computed from the server and are never recomputed here).

export function computeConsensus(recos = []) {
  if (!recos.length) return { bull: 0, bear: 0, neutral: 0, bullPct: 0, bearPct: 0, neutralPct: 0, strength: 0, label: 'No Data', total: 0 };
  const bull = recos.filter((r) => r.recommendation_type === 'Buy').length;
  const bear = recos.filter((r) => r.recommendation_type === 'Sell').length;
  const total = recos.length;
  const bullPct = Math.round((bull / total) * 100);
  const bearPct = Math.round((bear / total) * 100);
  const neutralPct = 100 - bullPct - bearPct;
  const strength = Math.abs(bullPct - bearPct);
  const leaning = bullPct > bearPct ? 'Bullish' : bearPct > bullPct ? 'Bearish' : 'Neutral';
  const label = leaning === 'Neutral' ? 'Neutral' : strength >= 60 ? `Strong ${leaning}` : strength >= 20 ? leaning : 'Neutral';
  return { bull, bear, neutral: total - bull - bear, bullPct, bearPct, neutralPct, strength, label, total };
}

export function consensusStrengthColor(c) {
  if (c.bullPct > c.bearPct) return 'var(--gain)';
  if (c.bearPct > c.bullPct) return 'var(--loss)';
  return 'var(--muted)';
}
